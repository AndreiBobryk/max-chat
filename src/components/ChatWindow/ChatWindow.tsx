import { chatTitle } from '../../domain/chatReducer.ts'
import type { Chat, Message } from '../../domain/chatReducer.ts'
import { formatPhone } from '../../domain/phone.ts'
import { useChat } from '../../state/chat.ts'
import { Avatar } from '../ui/Avatar.tsx'
import { ArrowLeftIcon } from '../ui/icons.tsx'
import styles from './ChatWindow.module.css'
import { MessageInput } from './MessageInput.tsx'
import { MessageList } from './MessageList.tsx'

type ConversationProps = {
  chat: Chat
  messages: Message[]
  now: number
  onClose: () => void
  onSend: (text: string) => void
}

// Mounted per chat (see the key below), so the draft and the scroll position start fresh.
function Conversation({ chat, messages, now, onClose, onSend }: ConversationProps) {
  return (
    <>
      <header className={styles.header}>
        <button type="button" className={styles.back} aria-label="Закрыть чат" onClick={onClose}>
          <ArrowLeftIcon />
        </button>
        <Avatar seed={chat.key} name={chat.name} size="small" />
        <div className={styles.titles}>
          <h2 className={styles.name}>{chatTitle(chat)}</h2>
          {chat.name && chat.phone && <p className={styles.subtitle}>{formatPhone(chat.phone)}</p>}
        </div>
      </header>
      <MessageList messages={messages} now={now} />
      <MessageInput onSend={onSend} />
    </>
  )
}

export function ChatWindow({ now }: { now: number }) {
  const { state, selectChat, sendMessage } = useChat()
  const chat = state.activeChatKey === null ? undefined : state.chats[state.activeChatKey]

  return (
    <main className={`${styles.window} chat-background`}>
      {chat && (
        <Conversation
          key={chat.key}
          chat={chat}
          messages={state.messages[chat.key] ?? []}
          now={now}
          onClose={() => selectChat(null)}
          onSend={(text) => sendMessage(chat.key, text)}
        />
      )}
    </main>
  )
}
