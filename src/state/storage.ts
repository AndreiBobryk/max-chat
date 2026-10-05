import { isRecord } from '../api/json.ts'
import { initialChatState } from '../domain/chatReducer.ts'
import type {
  Chat,
  ChatState,
  IncomingMessage,
  Message,
  OutgoingStatus,
} from '../domain/chatReducer.ts'
import { INTERRUPTED_SEND_ERROR } from '../domain/errorMessages.ts'
import type { Session } from './session.ts'

const SESSION_KEY = 'max-chat:session'
const HISTORY_VERSION = 1
export const MAX_STORED_MESSAGES = 500

const OUTGOING_STATUSES: readonly OutgoingStatus[] = ['sending', 'sent', 'delivered', 'read', 'failed']

function historyKey(idInstance: string): string {
  return `max-chat:v${HISTORY_VERSION}:${idInstance}`
}

// Storage may be unavailable, full, or hold anything at all, so every access is guarded.
function read(getStorage: () => Storage, key: string): unknown {
  try {
    const raw = getStorage().getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function write(getStorage: () => Storage, key: string, value: unknown): void {
  try {
    getStorage().setItem(key, JSON.stringify(value))
  } catch {
    // Losing persistence must not break the running chat.
  }
}

// The session lives in sessionStorage: it survives a reload and goes away with the tab.
export function loadSession(): Session | null {
  const stored = read(() => sessionStorage, SESSION_KEY)
  if (!isRecord(stored)) return null
  const { idInstance, apiTokenInstance, apiUrl } = stored
  if (!isNonEmptyString(idInstance) || !isNonEmptyString(apiTokenInstance) || !isNonEmptyString(apiUrl)) {
    return null
  }
  return { idInstance, apiTokenInstance, apiUrl }
}

export function saveSession(session: Session): void {
  write(() => sessionStorage, SESSION_KEY, session)
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

// The API offers no way to load history with the three methods in use, so it is kept locally.
export function saveHistory(idInstance: string, state: ChatState): void {
  const messages = Object.fromEntries(
    Object.entries(state.messages).map(([key, list]) => [key, list.slice(-MAX_STORED_MESSAGES)]),
  )
  write(() => localStorage, historyKey(idInstance), {
    version: HISTORY_VERSION,
    chats: state.chats,
    messages,
    activeChatKey: state.activeChatKey,
  })
}

export function loadChatState(idInstance: string): ChatState {
  const stored = read(() => localStorage, historyKey(idInstance))
  if (
    !isRecord(stored) ||
    stored.version !== HISTORY_VERSION ||
    !isRecord(stored.chats) ||
    !isRecord(stored.messages)
  ) {
    return initialChatState
  }

  const chats: Record<string, Chat> = {}
  const messages: Record<string, Message[]> = {}
  for (const [key, value] of Object.entries(stored.chats)) {
    const chat = toChat(key, value)
    if (chat === null) continue
    const list = stored.messages[key]
    chats[key] = chat
    messages[key] = Array.isArray(list) ? list.flatMap((item) => toMessage(item) ?? []) : []
  }

  const { activeChatKey } = stored
  return {
    chats,
    messages,
    activeChatKey: typeof activeChatKey === 'string' && activeChatKey in chats ? activeChatKey : null,
    pendingUpdates: [],
  }
}

function toChat(key: string, value: unknown): Chat | null {
  if (!isRecord(value) || value.key !== key) return null
  const { sendChatId, unread, lastMessageAt, phone, maxChatId, name } = value
  if (!isNonEmptyString(sendChatId) || typeof unread !== 'number' || typeof lastMessageAt !== 'number') {
    return null
  }
  return {
    key,
    sendChatId,
    unread,
    lastMessageAt,
    ...(isNonEmptyString(phone) ? { phone } : {}),
    ...(isNonEmptyString(maxChatId) ? { maxChatId } : {}),
    ...(isNonEmptyString(name) ? { name } : {}),
  }
}

function toMessage(value: unknown): Message | null {
  if (!isRecord(value)) return null
  const { localId, idMessage, kind, text, timestamp, direction, status, error } = value
  if (
    !isNonEmptyString(localId) ||
    typeof text !== 'string' ||
    typeof timestamp !== 'number' ||
    (kind !== 'text' && kind !== 'unsupported')
  ) {
    return null
  }
  const base: Omit<IncomingMessage, 'direction'> = {
    localId,
    kind,
    text,
    timestamp,
    ...(isNonEmptyString(idMessage) ? { idMessage } : {}),
  }

  if (direction === 'in') return { ...base, direction }
  if (direction !== 'out' || !isOutgoingStatus(status)) return null
  // A send that was in flight when the page closed has an unknown outcome.
  if (status === 'sending') return { ...base, direction, status: 'failed', error: INTERRUPTED_SEND_ERROR }
  return { ...base, direction, status, ...(typeof error === 'string' ? { error } : {}) }
}

function isOutgoingStatus(value: unknown): value is OutgoingStatus {
  return OUTGOING_STATUSES.some((status) => status === value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}
