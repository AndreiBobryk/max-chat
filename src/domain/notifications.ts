import { isRecord } from '../api/json.ts'

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'noAccount' | 'unknown'

export type NotificationEvent =
  | {
      type: 'incomingMessage'
      idMessage: string
      chatId: string
      senderPhone: string | null
      senderName: string
      timestamp: number
      kind: 'text' | 'unsupported'
      text: string
    }
  | { type: 'outgoingEcho'; idMessage: string; chatId: string }
  | { type: 'outgoingStatus'; idMessage: string; chatId: string; status: DeliveryStatus }
  | { type: 'instanceState'; state: string }
  | { type: 'quotaExceeded'; description: string }
  | { type: 'ignored' }

const IGNORED: NotificationEvent = { type: 'ignored' }

// These report a change to an existing message rather than a new one.
const NON_MESSAGE_TYPES = new Set(['reactionMessage', 'editedMessage', 'deletedMessage'])

const DELIVERY_STATUSES: Record<string, DeliveryStatus> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  notInGroup: 'failed',
  noAccount: 'noAccount',
}

// The body comes from the network, so nothing about its shape is assumed.
export function parseNotification(body: unknown, now: number = Date.now()): NotificationEvent {
  if (!isRecord(body)) return IGNORED

  switch (body.typeWebhook) {
    case 'incomingMessageReceived':
      return parseIncomingMessage(body, now)
    case 'outgoingAPIMessageReceived':
      return parseOutgoingEcho(body)
    case 'outgoingMessageStatus':
      return parseOutgoingStatus(body)
    case 'stateInstanceChanged':
      return typeof body.stateInstance === 'string'
        ? { type: 'instanceState', state: body.stateInstance }
        : IGNORED
    case 'quotaExceeded':
      return { type: 'quotaExceeded', description: readString(body.quotaData, 'description') ?? '' }
    default:
      return IGNORED
  }
}

function parseIncomingMessage(body: Record<string, unknown>, now: number): NotificationEvent {
  const sender = body.senderData
  const message = body.messageData
  if (!isRecord(sender) || !isRecord(message)) return IGNORED

  const idMessage = toId(body.idMessage)
  const chatId = toId(sender.chatId)
  if (idMessage === null || chatId === null) return IGNORED
  if (!isPersonalChat(sender.chatType, chatId)) return IGNORED

  const typeMessage = message.typeMessage
  if (typeof typeMessage !== 'string' || NON_MESSAGE_TYPES.has(typeMessage)) return IGNORED

  const text = extractText(typeMessage, message)
  return {
    type: 'incomingMessage',
    idMessage,
    chatId,
    senderPhone: toPhone(sender.senderPhoneNumber),
    senderName:
      [sender.senderContactName, sender.senderName, sender.chatName].find(isNonEmptyString) ?? '',
    timestamp: toMilliseconds(body.timestamp) ?? now,
    kind: text === null ? 'unsupported' : 'text',
    // A photo or a video may come with a caption: that text is kept even though the file is not.
    text: text ?? readString(message.fileMessageData, 'caption') ?? '',
  }
}

function parseOutgoingEcho(body: Record<string, unknown>): NotificationEvent {
  const idMessage = toId(body.idMessage)
  const chatId = isRecord(body.senderData) ? toId(body.senderData.chatId) : null
  if (idMessage === null || chatId === null) return IGNORED
  return { type: 'outgoingEcho', idMessage, chatId }
}

function parseOutgoingStatus(body: Record<string, unknown>): NotificationEvent {
  const idMessage = toId(body.idMessage)
  const chatId = toId(body.chatId)
  if (idMessage === null || chatId === null) return IGNORED
  const status = typeof body.status === 'string' ? DELIVERY_STATUSES[body.status] : undefined
  return { type: 'outgoingStatus', idMessage, chatId, status: status ?? 'unknown' }
}

function isPersonalChat(chatType: unknown, chatId: string): boolean {
  if (typeof chatType === 'string') return chatType === 'user'
  // Group chat ids are negative.
  return !chatId.startsWith('-')
}

function extractText(typeMessage: string, message: Record<string, unknown>): string | null {
  if (typeMessage === 'textMessage') return readString(message.textMessageData, 'textMessage')
  if (typeMessage === 'extendedTextMessage' || typeMessage === 'quotedMessage') {
    return readString(message.extendedTextMessageData, 'text')
  }
  return null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function readString(container: unknown, key: string): string | null {
  if (!isRecord(container)) return null
  const value = container[key]
  return isNonEmptyString(value) ? value : null
}

function toId(value: unknown): string | null {
  if (isNonEmptyString(value)) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

// A hidden phone number is reported as 0.
function toPhone(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value)
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value
  return null
}

function toMilliseconds(seconds: unknown): number | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : null
}
