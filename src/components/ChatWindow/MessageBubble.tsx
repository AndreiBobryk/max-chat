import type { ReactNode } from 'react'
import type { Message, OutgoingStatus } from '../../domain/chatReducer.ts'
import { UNSUPPORTED_MESSAGE_TEXT } from '../../domain/messageText.ts'
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

type MessageBubbleProps = {
  message: Message
  onRetry: () => void
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isOutgoing = message.direction === 'out'
  const mark = isOutgoing ? STATUS_MARKS[message.status] : null

  return (
    <div className={styles.row} data-direction={message.direction}>
      <div className={styles.bubble}>
        <div className={styles.content}>
          {message.kind === 'unsupported' && (
            <p className={styles.unsupported}>{UNSUPPORTED_MESSAGE_TEXT}</p>
          )}
          {message.text !== '' && <p className={styles.text}>{message.text}</p>}
        </div>
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
      {isOutgoing && message.status === 'failed' && (
        <p className={styles.error}>
          {message.error ?? 'Сообщение не отправлено'}
          <button type="button" className={styles.retry} onClick={onRetry}>
            Повторить
          </button>
        </p>
      )}
    </div>
  )
}
