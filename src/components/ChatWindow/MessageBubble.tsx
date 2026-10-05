import type { ReactNode } from 'react'
import type { Message, OutgoingStatus } from '../../domain/chatReducer.ts'
import { messageText } from '../../domain/messageText.ts'
import { formatTime } from '../../domain/time.ts'
import { AlertIcon, CheckIcon, ClockIcon, DoubleCheckIcon } from '../ui/icons.tsx'
import styles from './MessageBubble.module.css'

const STATUS_MARKS: Record<OutgoingStatus, { label: string; icon: ReactNode }> = {
  sending: { label: 'Отправляется', icon: <ClockIcon size={14} /> },
  sent: { label: 'Отправлено', icon: <CheckIcon size={14} /> },
  delivered: { label: 'Доставлено', icon: <DoubleCheckIcon size={14} /> },
  read: { label: 'Прочитано', icon: <DoubleCheckIcon size={14} /> },
  failed: { label: 'Не отправлено', icon: <AlertIcon size={14} /> },
}

export function MessageBubble({ message }: { message: Message }) {
  const isOutgoing = message.direction === 'out'
  const mark = isOutgoing ? STATUS_MARKS[message.status] : null

  return (
    <div className={styles.row} data-direction={message.direction}>
      <div className={styles.bubble}>
        <p className={message.kind === 'unsupported' ? styles.unsupported : styles.text}>
          {messageText(message)}
        </p>
        <span className={styles.meta}>
          <time>{formatTime(message.timestamp)}</time>
          {isOutgoing && mark && (
            <span
              role="img"
              aria-label={mark.label}
              title={mark.label}
              className={styles.status}
              data-status={message.status}
            >
              {mark.icon}
            </span>
          )}
        </span>
      </div>
      {isOutgoing && message.status === 'failed' && message.error && (
        <p className={styles.error}>{message.error}</p>
      )}
    </div>
  )
}
