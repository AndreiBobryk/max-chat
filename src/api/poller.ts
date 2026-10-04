import { GreenApiError } from './errors.ts'
import { MIN_RECEIVE_TIMEOUT } from './greenApi.ts'
import type { GreenApiClient } from './greenApi.ts'

export type PollerStatus = 'online' | 'reconnecting'

export type PollerOptions = {
  client: Pick<GreenApiClient, 'receiveNotification' | 'deleteNotification'>
  // Aborting the signal is the only way to stop the loop from outside.
  signal: AbortSignal
  onNotification: (body: unknown) => void
  // Called once, right before the loop gives up for good.
  onFatal: (error: unknown) => void
  onStatus?: (status: PollerStatus) => void
  // On login the form has to show why the first request failed, so it is not retried.
  failFast?: boolean
}

export const RECEIVE_TIMEOUT = 25
const MAX_BACKOFF_MS = 30_000

// Receive, handle, delete — one notification at a time, until aborted or a fatal error.
export async function startNotificationPoller(options: PollerOptions): Promise<void> {
  const { client, signal, onNotification, onFatal, onStatus, failFast = false } = options
  let connected = false
  let failures = 0
  let status: PollerStatus | undefined

  const report = (next: PollerStatus) => {
    if (status === next) return
    status = next
    onStatus?.(next)
  }

  while (!signal.aborted) {
    try {
      // The first answer is wanted quickly: it decides whether the credentials work.
      const notification = await client.receiveNotification({
        receiveTimeout: connected ? RECEIVE_TIMEOUT : MIN_RECEIVE_TIMEOUT,
        signal,
      })
      if (signal.aborted) break
      connected = true
      report('online')

      if (notification !== null) {
        try {
          onNotification(notification.body)
        } catch (error) {
          // The queue is FIFO: a notification that is not deleted blocks every later one.
          console.error('Failed to handle a notification', error)
        }
        await client.deleteNotification(notification.receiptId, { signal })
      }
      failures = 0
    } catch (error) {
      if (signal.aborted) break
      if (isFatal(error, connected, failFast)) {
        onFatal(error)
        return
      }
      report('reconnecting')
      await sleep(backoffDelay(failures), signal)
      failures += 1
    }
  }
}

function isFatal(error: unknown, connected: boolean, failFast: boolean): boolean {
  if (error instanceof GreenApiError) {
    if (error.kind === 'unauthorized' || error.kind === 'forbidden') return true
    // A request the server rejects outright will not start working by being repeated.
    if (!connected && (error.kind === 'badRequest' || error.kind === 'notFound')) return true
  }
  return failFast && !connected
}

function backoffDelay(failures: number): number {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** failures)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
