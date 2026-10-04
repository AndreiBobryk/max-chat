import { isRecord } from './json.ts'

export type GreenApiErrorKind =
  | 'badRequest'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'rateLimit'
  | 'quota'
  | 'server'
  | 'network'
  | 'timeout'
  | 'unknown'

type GreenApiErrorOptions = {
  status?: number
  serverText?: string
  cause?: unknown
}

const MAX_SERVER_TEXT_LENGTH = 300

// The request URL carries apiTokenInstance, so it must never end up in an error.
export class GreenApiError extends Error {
  readonly kind: GreenApiErrorKind
  readonly status: number | undefined
  readonly serverText: string

  constructor(kind: GreenApiErrorKind, options: GreenApiErrorOptions = {}) {
    const serverText = options.serverText ?? ''
    const status = options.status === undefined ? '' : ` (HTTP ${options.status})`
    super(`GREEN-API ${kind}${status}${serverText && `: ${serverText}`}`, { cause: options.cause })
    this.name = 'GreenApiError'
    this.kind = kind
    this.status = options.status
    this.serverText = serverText
  }
}

export function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError'
}

export function errorFromResponse(status: number, bodyText: string): GreenApiError {
  return new GreenApiError(kindFromStatus(status), { status, serverText: extractServerText(bodyText) })
}

function kindFromStatus(status: number): GreenApiErrorKind {
  if (status === 400) return 'badRequest'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'notFound'
  if (status === 429) return 'rateLimit'
  if (status === 466) return 'quota'
  if (status >= 500) return 'server'
  return 'unknown'
}

// Error bodies come as JSON, plain text, an nginx HTML page or nothing at all.
function extractServerText(bodyText: string): string {
  const text = bodyText.trim()
  if (text === '' || text.startsWith('<')) return ''

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return text.slice(0, MAX_SERVER_TEXT_LENGTH)
  }

  if (typeof parsed === 'string') return parsed.slice(0, MAX_SERVER_TEXT_LENGTH)
  if (!isRecord(parsed)) return ''

  const candidates = [
    parsed.message,
    isRecord(parsed.quotaData) ? parsed.quotaData.description : undefined,
    isRecord(parsed.invokeStatus) ? parsed.invokeStatus.description : undefined,
    parsed.description,
    parsed.error,
    parsed.reason,
  ]
  const found = candidates.find((value) => typeof value === 'string' && value !== '')
  return typeof found === 'string' ? found.slice(0, MAX_SERVER_TEXT_LENGTH) : ''
}
