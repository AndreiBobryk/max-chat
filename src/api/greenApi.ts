import { errorFromResponse, GreenApiError } from './errors.ts'
import { isRecord } from './json.ts'
import type { ReceivedNotification, SendMessageResult } from './types.ts'

export const FALLBACK_API_URL = 'https://api.green-api.com'
export const MAX_MESSAGE_LENGTH = 4000
export const MIN_RECEIVE_TIMEOUT = 5
export const MAX_RECEIVE_TIMEOUT = 60

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
// How long to keep waiting after the server-side long poll should have returned.
const RECEIVE_GRACE_MS = 10_000

export type GreenApiConfig = {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
  requestTimeoutMs?: number
}

type RequestOptions = {
  signal?: AbortSignal
}

export type GreenApiClient = {
  sendMessage(chatId: string, message: string, options?: RequestOptions): Promise<SendMessageResult>
  receiveNotification(
    options?: RequestOptions & { receiveTimeout?: number },
  ): Promise<ReceivedNotification | null>
  deleteNotification(receiptId: number, options?: RequestOptions): Promise<boolean>
}

// The instance host is derived from idInstance; the generic host is tried when it is unreachable.
export function apiUrlCandidates(idInstance: string, override?: string): string[] {
  if (override) return [override.replace(/\/+$/, '')]
  if (!/^\d{4,}$/.test(idInstance)) return [FALLBACK_API_URL]
  return [`https://${idInstance.slice(0, 4)}.api.green-api.com`, FALLBACK_API_URL]
}

export function createGreenApiClient(config: GreenApiConfig): GreenApiClient {
  const requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const token = encodeURIComponent(config.apiTokenInstance)
  const methodUrl = (method: string) =>
    `${config.apiUrl}/waInstance${config.idInstance}/${method}/${token}`

  return {
    async sendMessage(chatId, message, options = {}) {
      const data = parseJson(
        await request('POST', methodUrl('sendMessage'), {
          body: { chatId, message },
          signal: options.signal,
          timeoutMs: requestTimeoutMs,
        }),
      )
      const idMessage = isRecord(data) ? data.idMessage : undefined
      if (typeof idMessage !== 'string' && typeof idMessage !== 'number') {
        throw new GreenApiError('unknown')
      }
      return { idMessage: String(idMessage) }
    },

    async receiveNotification(options = {}) {
      const seconds = clampReceiveTimeout(options.receiveTimeout ?? MIN_RECEIVE_TIMEOUT)
      const data = parseJson(
        await request('GET', `${methodUrl('receiveNotification')}?receiveTimeout=${seconds}`, {
          signal: options.signal,
          timeoutMs: seconds * 1000 + RECEIVE_GRACE_MS,
        }),
      )
      // An empty queue is reported as an empty body or as null.
      if (data === null) return null
      if (!isRecord(data) || typeof data.receiptId !== 'number') {
        throw new GreenApiError('unknown')
      }
      return { receiptId: data.receiptId, body: data.body }
    },

    async deleteNotification(receiptId, options = {}) {
      const data = parseJson(
        await request('DELETE', `${methodUrl('deleteNotification')}/${receiptId}`, {
          signal: options.signal,
          timeoutMs: requestTimeoutMs,
        }),
      )
      return isRecord(data) && data.result === true
    },
  }
}

function clampReceiveTimeout(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_RECEIVE_TIMEOUT
  return Math.min(MAX_RECEIVE_TIMEOUT, Math.max(MIN_RECEIVE_TIMEOUT, Math.round(seconds)))
}

type InternalRequestOptions = {
  body?: unknown
  signal?: AbortSignal
  timeoutMs: number
}

async function request(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  { body, signal, timeoutMs }: InternalRequestOptions,
): Promise<string> {
  signal?.throwIfAborted()

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      cache: 'no-store',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const text = await response.text()
    if (!response.ok) throw errorFromResponse(response.status, text)
    return text
  } catch (error) {
    if (error instanceof GreenApiError) throw error
    // Cancellation by the caller is not a failure and is passed through untouched.
    if (signal?.aborted) throw error
    throw new GreenApiError(timedOut ? 'timeout' : 'network', { cause: error })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function parseJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed)
  } catch (error) {
    throw new GreenApiError('unknown', { cause: error })
  }
}
