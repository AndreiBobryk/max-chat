import { delay, http, HttpResponse } from 'msw'
import { server } from './server.ts'

// How long the fake holds a request while the queue is empty. Like the real API it holds for the
// requested wait, only scaled down: the short wait of a first poll, and a longer one after it.
const SHORT_POLL_MS = 50
const LONG_POLL_MS = 1500

export type FakeCall =
  | { method: 'receiveNotification'; receiveTimeout: string | null }
  | { method: 'deleteNotification'; receiptId: number }
  | { method: 'sendMessage'; body: unknown }

type SendResponder = (body: { chatId: string; message: string }) => Response | Promise<Response>

type FakeGreenApiOptions = {
  apiUrl?: string
  idInstance?: string
  apiTokenInstance?: string
}

// An in-memory GREEN-API instance behind MSW: a notification queue and the three methods in use.
export function fakeGreenApi(options: FakeGreenApiOptions = {}) {
  const apiUrl = options.apiUrl ?? 'https://3100.api.green-api.com'
  const idInstance = options.idInstance ?? '3100000001'
  const apiTokenInstance = options.apiTokenInstance ?? 'test-token'
  const base = `${apiUrl}/waInstance${idInstance}`

  const calls: FakeCall[] = []
  const queue: Array<{ receiptId: number; body: unknown }> = []
  let nextReceiptId = 1
  let nextMessageId = 1
  let wake = () => {}
  let respondToSend: SendResponder = () => HttpResponse.json({ idMessage: `out-${nextMessageId++}` })

  server.use(
    http.get(`${base}/receiveNotification/${apiTokenInstance}`, async ({ request }) => {
      const receiveTimeout = new URL(request.url).searchParams.get('receiveTimeout')
      calls.push({ method: 'receiveNotification', receiveTimeout })
      if (queue.length === 0) {
        const pushed = new Promise<void>((resolve) => {
          wake = resolve
        })
        await Promise.race([pushed, delay(receiveTimeout === '5' ? SHORT_POLL_MS : LONG_POLL_MS)])
      }
      return HttpResponse.json(queue[0] ?? null)
    }),

    http.delete(`${base}/deleteNotification/${apiTokenInstance}/:receiptId`, ({ params }) => {
      const receiptId = Number(params.receiptId)
      calls.push({ method: 'deleteNotification', receiptId })
      const index = queue.findIndex((item) => item.receiptId === receiptId)
      if (index === -1) return HttpResponse.json({ result: false, reason: 'not found' })
      queue.splice(index, 1)
      return HttpResponse.json({ result: true, reason: '' })
    }),

    http.post(`${base}/sendMessage/${apiTokenInstance}`, async ({ request }) => {
      const body = (await request.json()) as { chatId: string; message: string }
      calls.push({ method: 'sendMessage', body })
      return respondToSend(body)
    }),
  )

  return {
    apiUrl,
    credentials: { idInstance, apiTokenInstance },
    calls,
    count: (method: FakeCall['method']) => calls.filter((call) => call.method === method).length,
    // Puts a notification into the queue and returns its receiptId.
    notify(body: unknown): number {
      const receiptId = nextReceiptId++
      queue.push({ receiptId, body })
      wake()
      return receiptId
    },
    onSend(responder: SendResponder) {
      respondToSend = responder
    },
  }
}
