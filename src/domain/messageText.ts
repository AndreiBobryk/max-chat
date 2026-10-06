import type { Message } from './chatReducer.ts'

export const UNSUPPORTED_MESSAGE_TEXT = 'Сообщение этого типа не поддерживается'

// One line that stands for a message in the chat list: its text, the caption of an unsupported
// attachment, or the placeholder when there is no text at all.
export function messageText(message: Message): string {
  return message.text === '' ? UNSUPPORTED_MESSAGE_TEXT : message.text
}
