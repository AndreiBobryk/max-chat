import type { ChatAction } from './chatReducer.ts'
import { describeDeliveryFailure } from './errorMessages.ts'
import type { NotificationEvent } from './notifications.ts'

// Events that do not change the chats (service notifications, ignored ones) give null.
export function chatActionFromEvent(event: NotificationEvent): ChatAction | null {
  switch (event.type) {
    case 'incomingMessage':
      return { ...event, type: 'incomingReceived' }
    case 'outgoingEcho':
      return { type: 'chatBound', idMessage: event.idMessage, chatId: event.chatId }
    case 'outgoingStatus': {
      const { idMessage, chatId, status } = event
      // An unrecognised status still tells which chat the message went to.
      if (status === 'unknown') return { type: 'chatBound', idMessage, chatId }
      if (status === 'failed' || status === 'noAccount') {
        return {
          type: 'statusReceived',
          idMessage,
          chatId,
          status: 'failed',
          error: describeDeliveryFailure(status),
        }
      }
      return { type: 'statusReceived', idMessage, chatId, status }
    }
    default:
      return null
  }
}
