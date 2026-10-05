import type { RefObject } from 'react'
import { selectChatList } from '../../domain/chatReducer.ts'
import { useChat } from '../../state/chat.ts'
import { useSession } from '../../state/session.ts'
import { LogoutIcon, PlusIcon } from '../ui/icons.tsx'
import { ChatList } from './ChatList.tsx'
import styles from './Sidebar.module.css'

type SidebarProps = {
  now: number
  onNewChat: () => void
  newChatButtonRef: RefObject<HTMLButtonElement | null>
}

export function Sidebar({ now, onNewChat, newChatButtonRef }: SidebarProps) {
  const { session, signOut } = useSession()
  const { state, selectChat } = useChat()
  const chats = selectChatList(state)

  return (
    <aside className={styles.sidebar}>
      <header className={styles.header}>
        <h1 className={styles.title}>Чаты</h1>
        <button
          ref={newChatButtonRef}
          type="button"
          className={styles.addButton}
          aria-label="Новый чат"
          title="Новый чат"
          onClick={onNewChat}
        >
          <PlusIcon size={18} />
        </button>
      </header>

      {chats.length === 0 ? (
        <p className={styles.empty}>
          Чатов пока нет. Нажмите «+», чтобы написать по номеру телефона
        </p>
      ) : (
        <ChatList
          chats={chats}
          messages={state.messages}
          activeChatKey={state.activeChatKey}
          now={now}
          onSelect={selectChat}
        />
      )}

      <footer className={styles.footer}>
        <span className={styles.instance}>Инстанс {session?.idInstance}</span>
        <button type="button" className={styles.signOut} onClick={signOut}>
          <LogoutIcon size={16} />
          Выйти
        </button>
      </footer>
    </aside>
  )
}
