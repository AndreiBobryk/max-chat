import { formatPhone, toSendChatId } from './phone.ts'

export type OutgoingStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
// What a status notification can report: everything except the local "sending".
export type ReportedStatus = Exclude<OutgoingStatus, 'sending'>

type MessageBase = {
  localId: string
  idMessage?: string
  kind: 'text' | 'unsupported'
  text: string
  timestamp: number
}

export type IncomingMessage = MessageBase & { direction: 'in' }
export type OutgoingMessage = MessageBase & {
  direction: 'out'
  status: OutgoingStatus
  error?: string
}
export type Message = IncomingMessage | OutgoingMessage

export type Chat = {
  key: string
  phone?: string
  // What sendMessage gets: "<phone>@c.us" for chats created by phone, the MAX chat id otherwise.
  sendChatId: string
  // The numeric MAX chat id that incoming notifications carry; unknown until learnt.
  maxChatId?: string
  name?: string
  unread: number
  lastMessageAt: number
}

// A notification about an outgoing message that arrived before sendMessage returned its id.
type PendingUpdate = {
  idMessage: string
  chatId: string
  status?: ReportedStatus
  error?: string
}

export type ChatState = {
  chats: Record<string, Chat>
  // Per chat, in the order the messages arrived.
  messages: Record<string, Message[]>
  activeChatKey: string | null
  pendingUpdates: PendingUpdate[]
}

export type ChatAction =
  | { type: 'chatCreated'; phone: string; now: number }
  | { type: 'chatSelected'; key: string | null }
  | { type: 'messageQueued'; chatKey: string; localId: string; text: string; now: number }
  | { type: 'messageSent'; localId: string; idMessage: string }
  | { type: 'messageFailed'; localId: string; error: string }
  | { type: 'messageRetried'; localId: string; now: number }
  | {
      type: 'incomingReceived'
      idMessage: string
      chatId: string
      senderPhone: string | null
      senderName: string
      timestamp: number
      kind: 'text' | 'unsupported'
      text: string
    }
  | { type: 'chatBound'; idMessage: string; chatId: string }
  | { type: 'statusReceived'; idMessage: string; chatId: string; status: ReportedStatus; error?: string }

export const MAX_PENDING_UPDATES = 100

const STATUS_RANK: Record<OutgoingStatus, number> = {
  failed: 0,
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

export const initialChatState: ChatState = {
  chats: {},
  messages: {},
  activeChatKey: null,
  pendingUpdates: [],
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chatCreated':
      return createChat(state, action.phone, action.now)
    case 'chatSelected':
      return selectChat(state, action.key)
    case 'messageQueued':
      return queueMessage(state, action)
    case 'messageSent':
      return markSent(state, action.localId, action.idMessage)
    case 'messageFailed': {
      const found = findOutgoing(state, (message) => message.localId === action.localId)
      if (!found) return state
      return replaceMessage(state, found, { ...found.message, status: 'failed', error: action.error })
    }
    case 'messageRetried':
      return retryMessage(state, action.localId, action.now)
    case 'incomingReceived':
      return receiveIncoming(state, action)
    case 'chatBound':
      return applyUpdate(state, { idMessage: action.idMessage, chatId: action.chatId })
    case 'statusReceived':
      return applyUpdate(state, {
        idMessage: action.idMessage,
        chatId: action.chatId,
        status: action.status,
        error: action.error,
      })
  }
}

export function selectChatList(state: ChatState): Chat[] {
  return Object.values(state.chats).sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}

export function chatTitle(chat: Chat): string {
  if (chat.name) return chat.name
  if (chat.phone) return formatPhone(chat.phone)
  return chat.maxChatId ?? chat.sendChatId
}

function createChat(state: ChatState, phone: string, now: number): ChatState {
  const key = `phone:${phone}`
  const existing =
    state.chats[key] ?? Object.values(state.chats).find((chat) => chat.phone === phone)
  if (existing) return selectChat(state, existing.key)

  const chat: Chat = { key, phone, sendChatId: toSendChatId(phone), unread: 0, lastMessageAt: now }
  return {
    ...state,
    chats: { ...state.chats, [key]: chat },
    messages: { ...state.messages, [key]: [] },
    activeChatKey: key,
  }
}

function selectChat(state: ChatState, key: string | null): ChatState {
  if (key === null) return { ...state, activeChatKey: null }
  const chat = state.chats[key]
  if (!chat) return state
  return { ...state, activeChatKey: key, chats: { ...state.chats, [key]: { ...chat, unread: 0 } } }
}

function queueMessage(
  state: ChatState,
  action: { chatKey: string; localId: string; text: string; now: number },
): ChatState {
  const chat = state.chats[action.chatKey]
  if (!chat) return state
  const message: OutgoingMessage = {
    localId: action.localId,
    direction: 'out',
    kind: 'text',
    text: action.text,
    timestamp: action.now,
    status: 'sending',
  }
  return appendMessage(state, chat, message)
}

function markSent(state: ChatState, localId: string, idMessage: string): ChatState {
  const found = findOutgoing(state, (message) => message.localId === localId)
  if (!found) return state

  const sent: OutgoingMessage = {
    ...found.message,
    idMessage,
    status: found.message.status === 'sending' ? 'sent' : found.message.status,
  }
  const pending = state.pendingUpdates.filter((update) => update.idMessage === idMessage)
  const next: ChatState = {
    ...replaceMessage(state, found, sent),
    pendingUpdates: state.pendingUpdates.filter((update) => update.idMessage !== idMessage),
  }
  return pending.reduce(applyUpdate, next)
}

function retryMessage(state: ChatState, localId: string, now: number): ChatState {
  const found = findOutgoing(state, (message) => message.localId === localId)
  if (!found || found.message.status !== 'failed') return state

  // The retry is a new send: it moves to the end and forgets the id of the failed attempt.
  const retried: OutgoingMessage = {
    localId,
    direction: 'out',
    kind: found.message.kind,
    text: found.message.text,
    timestamp: now,
    status: 'sending',
  }
  const others = state.messages[found.chatKey].filter((_, index) => index !== found.index)
  const withoutFailed = { ...state, messages: { ...state.messages, [found.chatKey]: others } }
  return appendMessage(withoutFailed, state.chats[found.chatKey], retried)
}

function receiveIncoming(
  state: ChatState,
  action: Extract<ChatAction, { type: 'incomingReceived' }>,
): ChatState {
  const { idMessage, chatId, senderPhone, senderName } = action
  // A notification is delivered again when its deletion failed.
  const isDuplicate = Object.values(state.messages).some((messages) =>
    messages.some((message) => message.direction === 'in' && message.idMessage === idMessage),
  )
  if (isDuplicate) return state

  const chats = Object.values(state.chats)
  const known =
    chats.find((chat) => chat.maxChatId === chatId) ??
    chats.find((chat) => senderPhone !== null && chat.phone === senderPhone && !chat.maxChatId)
  const chat: Chat = known ?? {
    key: `id:${chatId}`,
    ...(senderPhone === null ? {} : { phone: senderPhone }),
    sendChatId: chatId,
    unread: 0,
    lastMessageAt: action.timestamp,
  }

  const message: IncomingMessage = {
    localId: `in:${idMessage}`,
    idMessage,
    direction: 'in',
    kind: action.kind,
    text: action.text,
    timestamp: action.timestamp,
  }
  const isActive = state.activeChatKey === chat.key
  return appendMessage(
    state,
    {
      ...chat,
      maxChatId: chatId,
      name: senderName || chat.name,
      unread: isActive ? 0 : chat.unread + 1,
    },
    message,
  )
}

function applyUpdate(state: ChatState, update: PendingUpdate): ChatState {
  const found = findOutgoing(state, (message) => message.idMessage === update.idMessage)
  if (!found) {
    return {
      ...state,
      pendingUpdates: [...state.pendingUpdates, update].slice(-MAX_PENDING_UPDATES),
    }
  }
  const updated = update.status
    ? replaceMessage(state, found, withStatus(found.message, update.status, update.error))
    : state
  return bindChat(updated, found.chatKey, update.chatId)
}

function withStatus(
  message: OutgoingMessage,
  status: ReportedStatus,
  error: string | undefined,
): OutgoingMessage {
  if (status === 'failed') {
    // A failure report cannot undo a confirmed delivery.
    if (STATUS_RANK[message.status] > STATUS_RANK.sent) return message
    return { ...message, status, error }
  }
  if (STATUS_RANK[status] <= STATUS_RANK[message.status]) return message
  return { ...message, status, error: undefined }
}

function bindChat(state: ChatState, chatKey: string, chatId: string): ChatState {
  const chat = state.chats[chatKey]
  if (!chat || chat.maxChatId) return state

  const bound: ChatState = {
    ...state,
    chats: { ...state.chats, [chatKey]: { ...chat, maxChatId: chatId } },
  }
  // The same person may already have a chat created by an incoming message.
  const duplicate = Object.values(state.chats).find(
    (other) => other.key !== chatKey && other.maxChatId === chatId,
  )
  return duplicate ? mergeChats(bound, chatKey, duplicate.key) : bound
}

function mergeChats(state: ChatState, targetKey: string, sourceKey: string): ChatState {
  const target = state.chats[targetKey]
  const source = state.chats[sourceKey]
  const isActive = state.activeChatKey === targetKey || state.activeChatKey === sourceKey
  const merged: Chat = {
    ...target,
    name: target.name ?? source.name,
    unread: isActive ? 0 : target.unread + source.unread,
    lastMessageAt: Math.max(target.lastMessageAt, source.lastMessageAt),
  }
  const messages = [...(state.messages[targetKey] ?? []), ...(state.messages[sourceKey] ?? [])].sort(
    (a, b) => a.timestamp - b.timestamp,
  )
  return {
    ...state,
    chats: { ...withoutKey(state.chats, sourceKey), [targetKey]: merged },
    messages: { ...withoutKey(state.messages, sourceKey), [targetKey]: messages },
    activeChatKey: state.activeChatKey === sourceKey ? targetKey : state.activeChatKey,
  }
}

function appendMessage(state: ChatState, chat: Chat, message: Message): ChatState {
  return {
    ...state,
    chats: {
      ...state.chats,
      [chat.key]: { ...chat, lastMessageAt: Math.max(chat.lastMessageAt, message.timestamp) },
    },
    messages: { ...state.messages, [chat.key]: [...(state.messages[chat.key] ?? []), message] },
  }
}

type OutgoingLocation = { chatKey: string; index: number; message: OutgoingMessage }

function findOutgoing(
  state: ChatState,
  matches: (message: OutgoingMessage) => boolean,
): OutgoingLocation | null {
  for (const [chatKey, messages] of Object.entries(state.messages)) {
    for (const [index, message] of messages.entries()) {
      if (message.direction === 'out' && matches(message)) return { chatKey, index, message }
    }
  }
  return null
}

function replaceMessage(
  state: ChatState,
  location: OutgoingLocation,
  message: OutgoingMessage,
): ChatState {
  const messages = state.messages[location.chatKey].slice()
  messages[location.index] = message
  return { ...state, messages: { ...state.messages, [location.chatKey]: messages } }
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key))
}
