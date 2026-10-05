import { createContext, useContext } from 'react'
import type { ChatState } from '../domain/chatReducer.ts'

export type ChatContextValue = {
  state: ChatState
  // Expects a normalized, valid phone number.
  createChat: (phone: string) => void
  selectChat: (key: string | null) => void
  sendMessage: (chatKey: string, text: string) => void
  retryMessage: (localId: string) => void
}

export const ChatContext = createContext<ChatContextValue | null>(null)

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext)
  if (value === null) throw new Error('useChat must be used inside ChatProvider')
  return value
}
