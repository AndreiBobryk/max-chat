import type { Message } from './chatReducer.ts'

export const UNSUPPORTED_MESSAGE_TEXT = 'Сообщение этого типа не поддерживается'

// What to show for a message, in a bubble or in the chat list.
export function messageText(message: Message): string {
  return message.kind === 'unsupported' ? UNSUPPORTED_MESSAGE_TEXT : message.text
}
