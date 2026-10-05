import { useRef, useState } from 'react'
import { useChat } from '../../state/chat.ts'
import { useNow } from '../../state/useNow.ts'
import { ChatWindow } from '../ChatWindow/ChatWindow.tsx'
import { NewChatDialog } from '../NewChatDialog/NewChatDialog.tsx'
import { Sidebar } from '../Sidebar/Sidebar.tsx'
import styles from './ChatScreen.module.css'

export function ChatScreen() {
  const { createChat } = useChat()
  const now = useNow()
  const [isNewChatOpen, setNewChatOpen] = useState(false)
  const newChatButton = useRef<HTMLButtonElement>(null)

  return (
    <div className={styles.screen}>
      <Sidebar
        now={now}
        newChatButtonRef={newChatButton}
        onNewChat={() => setNewChatOpen(true)}
      />
      <ChatWindow now={now} />
      {isNewChatOpen && (
        <NewChatDialog
          onCreate={(phone) => {
            // The new chat's message field takes the focus when it appears.
            createChat(phone)
            setNewChatOpen(false)
          }}
          onCancel={() => {
            setNewChatOpen(false)
            newChatButton.current?.focus()
          }}
        />
      )}
    </div>
  )
}
