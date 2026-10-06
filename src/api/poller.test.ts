import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GreenApiError } from './errors.ts'
import { startNotificationPoller } from './poller.ts'
import type { PollerOptions, PollerStatus } from './poller.ts'
import type { ReceivedNotification } from './types.ts'

type Outcome = ReceivedNotification | null | Error
// What the next receiveNotification call does; once the script ends, calls hang until aborted.
type Step = Outcome | ((controller: AbortController) => Outcome | Promise<Outcome>)

function notification(receiptId: number): ReceivedNotification {
  return { receiptId, body: { receiptId } }
}

function untilAborted(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

function setup(script: Step[], options: Partial<PollerOptions> = {}) {
  const log: string[] = []
  const statuses: PollerStatus[] = []
  const deleteFailures: Error[] = []
  // What the next deleteNotification calls answer; true once the list is used up.
  const deleteResults: boolean[] = []
  const controller = new AbortController()
  const onFatal = vi.fn()
  let inFlight = 0
  let maxInFlight = 0

  async function track<T>(work: () => Promise<T>): Promise<T> {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    try {
      return await work()
    } finally {
      inFlight -= 1
    }
  }

  const client: PollerOptions['client'] = {
    receiveNotification: ({ receiveTimeout, signal } = {}) =>
      track(async () => {
        log.push(`receive:${receiveTimeout}`)
        const step = script.shift()
        if (step === undefined) return untilAborted(signal)
        const outcome = await (typeof step === 'function' ? step(controller) : step)
        if (outcome instanceof Error) throw outcome
        return outcome
      }),
    deleteNotification: (receiptId) =>
      track(async () => {
        log.push(`delete:${receiptId}`)
        const failure = deleteFailures.shift()
        if (failure) throw failure
        return deleteResults.shift() ?? true
      }),
  }

  const done = startNotificationPoller({
    client,
    signal: controller.signal,
    onNotification: (body) => log.push(`handle:${JSON.stringify(body)}`),
    onFatal,
    onStatus: (status) => statuses.push(status),
    ...options,
  })

  return {
    log,
    statuses,
    deleteFailures,
    deleteResults,
    controller,
    onFatal,
    done,
    receiveCount: () => log.filter((entry) => entry.startsWith('receive')).length,
    maxInFlight: () => maxInFlight,
    async stop() {
      controller.abort()
      await done
    },
  }
}

// Lets every pending promise chain run until it waits on a timer or on a hanging request.
const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('processing notifications', () => {
  it('receives, handles and deletes a notification, in that order', async () => {
    const poller = setup([notification(7)])
    await settle()

    expect(poller.log).toEqual(['receive:5', 'handle:{"receiptId":7}', 'delete:7', 'receive:25'])
    await poller.stop()
  })

  it('skips the deletion and polls again when the queue is empty', async () => {
    const poller = setup([null])
    await settle()

    expect(poller.log).toEqual(['receive:5', 'receive:25'])
    await poller.stop()
  })

  it('asks for a short wait first and for a long one after the first answer', async () => {
    const poller = setup([null, notification(1), null])
    await settle()

    expect(poller.log.filter((entry) => entry.startsWith('receive'))).toEqual([
      'receive:5',
      'receive:25',
      'receive:25',
      'receive:25',
    ])
    await poller.stop()
  })

  it('deletes a notification even when its handler throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const poller = setup([notification(7), notification(8)], {
      onNotification: () => {
        throw new Error('broken handler')
      },
    })
    await settle()

    expect(poller.log).toEqual(['receive:5', 'delete:7', 'receive:25', 'delete:8', 'receive:25'])
    expect(consoleError).toHaveBeenCalledTimes(2)
    await poller.stop()
  })

  it('keeps polling after a deletion fails', async () => {
    const poller = setup([notification(7), notification(7)])
    poller.deleteFailures.push(new GreenApiError('server', { status: 500 }))
    await settle()

    expect(poller.log).toEqual(['receive:5', 'handle:{"receiptId":7}', 'delete:7'])
    expect(poller.statuses).toEqual(['online', 'reconnecting'])

    await vi.advanceTimersByTimeAsync(1000)

    expect(poller.log.slice(3)).toEqual(['receive:5', 'handle:{"receiptId":7}', 'delete:7', 'receive:25'])
    expect(poller.statuses).toEqual(['online', 'reconnecting', 'online'])
    await poller.stop()
  })

  it('asks for a short wait again after a failure, until an answer arrives', async () => {
    const poller = setup([null, new GreenApiError('network'), new GreenApiError('network'), null])
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)

    expect(poller.log).toEqual(['receive:5', 'receive:25', 'receive:5', 'receive:5', 'receive:25'])
    expect(poller.statuses).toEqual(['online', 'reconnecting', 'online'])
    await poller.stop()
  })

  it('never runs two requests at once', async () => {
    const poller = setup([notification(1), null, notification(2), notification(3)])
    await settle()

    expect(poller.receiveCount()).toBe(5)
    expect(poller.maxInFlight()).toBe(1)
    await poller.stop()
  })
})

describe('fatal errors', () => {
  it.each([
    { kind: 'unauthorized', status: 401 },
    { kind: 'forbidden', status: 403 },
  ] as const)('stops for good on $status', async ({ kind, status }) => {
    const error = new GreenApiError(kind, { status })
    const poller = setup([null, error, null])
    await settle()
    await poller.done

    expect(poller.onFatal).toHaveBeenCalledExactlyOnceWith(error)
    expect(poller.receiveCount()).toBe(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(poller.receiveCount()).toBe(2)
  })

  it.each([
    { kind: 'badRequest', status: 400 },
    { kind: 'notFound', status: 404 },
  ] as const)('stops on $status when it has never connected', async ({ kind, status }) => {
    const error = new GreenApiError(kind, { status })
    const poller = setup([error])
    await settle()
    await poller.done

    expect(poller.onFatal).toHaveBeenCalledExactlyOnceWith(error)
    expect(poller.receiveCount()).toBe(1)
  })

  it('retries a 400 that happens after it has connected', async () => {
    const poller = setup([null, new GreenApiError('badRequest', { status: 400 })])
    await settle()

    expect(poller.onFatal).not.toHaveBeenCalled()
    expect(poller.receiveCount()).toBe(2)

    await vi.advanceTimersByTimeAsync(1000)
    expect(poller.receiveCount()).toBe(3)
    await poller.stop()
  })

  it('reports any failure of the first request in failFast mode', async () => {
    const error = new GreenApiError('network')
    const poller = setup([error], { failFast: true })
    await settle()
    await poller.done

    expect(poller.onFatal).toHaveBeenCalledExactlyOnceWith(error)
    expect(poller.receiveCount()).toBe(1)
  })

  it('retries in failFast mode once it has connected', async () => {
    const poller = setup([null, new GreenApiError('network')], { failFast: true })
    await settle()

    expect(poller.onFatal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(poller.receiveCount()).toBe(3)
    await poller.stop()
  })
})

describe('retrying', () => {
  it('backs off 1, 2, 4, 8, 16, 30, 30 seconds and starts over after a success', async () => {
    const network = new GreenApiError('network')
    const badGateway = new GreenApiError('server', { status: 502 })
    const poller = setup([
      network,
      badGateway,
      network,
      badGateway,
      network,
      badGateway,
      network,
      null,
      network,
    ])
    await settle()
    expect(poller.receiveCount()).toBe(1)

    let expected = 1
    for (const delay of [1000, 2000, 4000, 8000, 16_000, 30_000]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(poller.receiveCount()).toBe(expected)
      await vi.advanceTimersByTimeAsync(1)
      expected += 1
      expect(poller.receiveCount()).toBe(expected)
    }

    // The seventh wait is capped at 30 s; the request after it succeeds and the next one fails.
    await vi.advanceTimersByTimeAsync(29_999)
    expect(poller.receiveCount()).toBe(7)
    await vi.advanceTimersByTimeAsync(1)
    expect(poller.receiveCount()).toBe(9)

    await vi.advanceTimersByTimeAsync(999)
    expect(poller.receiveCount()).toBe(9)
    await vi.advanceTimersByTimeAsync(1)
    expect(poller.receiveCount()).toBe(10)

    expect(poller.onFatal).not.toHaveBeenCalled()
    expect(poller.statuses).toEqual(['reconnecting', 'online', 'reconnecting'])
    await poller.stop()
  })

  it('waits at least a second after a 429', async () => {
    const poller = setup([null, new GreenApiError('rateLimit', { status: 429 })])
    await settle()
    expect(poller.receiveCount()).toBe(2)

    await vi.advanceTimersByTimeAsync(999)
    expect(poller.receiveCount()).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(poller.receiveCount()).toBe(3)
    await poller.stop()
  })

  it('reports each status change once', async () => {
    const poller = setup([null, notification(1), notification(2), new GreenApiError('timeout'), null, notification(3)])
    await settle()
    await vi.advanceTimersByTimeAsync(1000)

    expect(poller.statuses).toEqual(['online', 'reconnecting', 'online'])
    await poller.stop()
  })
})

describe('a queue that does not make the request wait', () => {
  const afterFullWait = () =>
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 25_000)
    })

  it('does not flood a server that answers an empty queue at once', async () => {
    const poller = setup([null, null, null, null])
    await settle()
    // One immediate repeat is allowed: the first short poll at sign-in is expected to be quick.
    expect(poller.receiveCount()).toBe(2)

    await vi.advanceTimersByTimeAsync(999)
    expect(poller.receiveCount()).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(poller.receiveCount()).toBe(3)

    await vi.advanceTimersByTimeAsync(1000)
    expect(poller.receiveCount()).toBe(4)
    await vi.advanceTimersByTimeAsync(1000)
    expect(poller.receiveCount()).toBe(5)
    expect(poller.statuses).toEqual(['online'])
    await poller.stop()
  })

  it('asks again at once when the empty answer took the full wait', async () => {
    const poller = setup([afterFullWait, afterFullWait])
    await settle()
    expect(poller.receiveCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(25_000)
    expect(poller.receiveCount()).toBe(2)
    await vi.advanceTimersByTimeAsync(25_000)
    expect(poller.receiveCount()).toBe(3)
    await poller.stop()
  })

  it('drains a full queue without pauses', async () => {
    const poller = setup([notification(1), notification(2), notification(3), notification(4)])
    await settle()

    expect(poller.receiveCount()).toBe(5)
    await poller.stop()
  })

  it('goes back to full speed once a notification arrives', async () => {
    const poller = setup([null, null, notification(1), null])
    await settle()
    await vi.advanceTimersByTimeAsync(1000)

    expect(poller.log.slice(2)).toEqual(['receive:25', 'handle:{"receiptId":1}', 'delete:1', 'receive:25', 'receive:25'])
    await poller.stop()
  })

  it('pauses before receiving again when a notification could not be deleted', async () => {
    const poller = setup([notification(7), notification(7), notification(8)])
    poller.deleteResults.push(false, false)
    await settle()
    expect(poller.log).toEqual(['receive:5', 'handle:{"receiptId":7}', 'delete:7'])

    await vi.advanceTimersByTimeAsync(999)
    expect(poller.receiveCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(poller.log.slice(3)).toEqual(['receive:25', 'handle:{"receiptId":7}', 'delete:7'])

    await vi.advanceTimersByTimeAsync(1000)
    expect(poller.log.slice(6)).toEqual(['receive:25', 'handle:{"receiptId":8}', 'delete:8', 'receive:25'])
    expect(poller.statuses).toEqual(['online'])
    await poller.stop()
  })

  it('stops promptly when aborted during the pause', async () => {
    const poller = setup([null, null, null])
    await settle()
    expect(poller.receiveCount()).toBe(2)

    await poller.stop()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(poller.receiveCount()).toBe(2)
  })
})

describe('stopping', () => {
  it('ends the loop when aborted during a request', async () => {
    const poller = setup([null])
    await settle()
    expect(poller.receiveCount()).toBe(2)

    await poller.stop()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(poller.receiveCount()).toBe(2)
    expect(poller.onFatal).not.toHaveBeenCalled()
    expect(poller.statuses).toEqual(['online'])
  })

  it('ends the loop when aborted during a backoff wait', async () => {
    const poller = setup([new GreenApiError('network'), null])
    await settle()
    expect(poller.statuses).toEqual(['reconnecting'])

    await poller.stop()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(poller.receiveCount()).toBe(1)
  })

  it('leaves a notification in the queue when aborted before it is handled', async () => {
    const poller = setup([
      (controller) => {
        controller.abort()
        return notification(7)
      },
    ])
    await settle()
    await poller.done

    expect(poller.log).toEqual(['receive:5'])
  })

  it('does nothing when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const receiveNotification = vi.fn()

    await startNotificationPoller({
      client: { receiveNotification, deleteNotification: vi.fn() },
      signal: controller.signal,
      onNotification: vi.fn(),
      onFatal: vi.fn(),
    })

    expect(receiveNotification).not.toHaveBeenCalled()
  })
})
