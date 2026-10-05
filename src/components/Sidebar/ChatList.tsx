import { chatTitle } from '../../domain/chatReducer.ts'
import type { Chat, Message } from '../../domain/chatReducer.ts'
import { messageText } from '../../domain/messageText.ts'
import { formatListTime } from '../../domain/time.ts'
import { Avatar } from '../ui/Avatar.tsx'
import styles from './ChatList.module.css'

type ChatListProps = {
  // Already in display order.
  chats: Chat[]
  messages: Record<string, Message[]>
  activeChatKey: string | null
  now: number
  onSelect: (key: string) => void
}

function previewText(message: Message | undefined): string {
  if (!message) return 'Сообщений пока нет'
  const text = messageText(message)
  return message.direction === 'out' ? `Вы: ${text}` : text
}

export function ChatList({ chats, messages, activeChatKey, now, onSelect }: ChatListProps) {
  return (
    <ul className={styles.list} aria-label="Чаты">
      {chats.map((chat) => (
        <li key={chat.key}>
          <button
            type="button"
            className={styles.item}
            aria-current={chat.key === activeChatKey ? 'true' : undefined}
            onClick={() => onSelect(chat.key)}
          >
            <Avatar seed={chat.key} name={chat.name} />
            <span className={styles.body}>
              <span className={styles.line}>
                <span className={styles.name}>{chatTitle(chat)}</span>
                <span className={styles.time}>{formatListTime(chat.lastMessageAt, now)}</span>
              </span>
              <span className={styles.line}>
                <span className={styles.preview}>{previewText(messages[chat.key]?.at(-1))}</span>
                {chat.unread > 0 && (
                  <span className={styles.badge} aria-label={`Непрочитанных: ${chat.unread}`}>
                    {chat.unread}
                  </span>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
