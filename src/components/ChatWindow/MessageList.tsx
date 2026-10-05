import { Fragment, useLayoutEffect, useRef } from 'react'
import type { Message } from '../../domain/chatReducer.ts'
import { formatDayLabel, isSameDay } from '../../domain/time.ts'
import { MessageBubble } from './MessageBubble.tsx'
import styles from './MessageList.module.css'

// How close to the bottom the view must be to keep following new messages.
const STICK_THRESHOLD_PX = 80

type MessageListProps = {
  messages: Message[]
  now: number
}

export function MessageList({ messages, now }: MessageListProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const previousCount = useRef(0)

  // Follow new messages unless the user has scrolled up to read; an own message always scrolls.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const isOwnNewMessage =
      messages.length > previousCount.current && messages.at(-1)?.direction === 'out'
    previousCount.current = messages.length
    if (stickToBottom.current || isOwnNewMessage) element.scrollTop = element.scrollHeight
  }, [messages])

  function handleScroll() {
    const element = scroller.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    stickToBottom.current = distance < STICK_THRESHOLD_PX
  }

  return (
    <div ref={scroller} className={styles.scroller} onScroll={handleScroll}>
      <div role="log" aria-label="Сообщения" className={styles.list}>
        {messages.length === 0 && (
          <div className={styles.emptyCard}>
            <p className={styles.emptyTitle}>Сообщений пока нет</p>
            <p className={styles.emptyText}>Напишите первое сообщение</p>
          </div>
        )}
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const startsDay = !previous || !isSameDay(previous.timestamp, message.timestamp)
          return (
            <Fragment key={message.localId}>
              {startsDay && (
                <div className={styles.day}>
                  <span className={styles.pill}>{formatDayLabel(message.timestamp, now)}</span>
                </div>
              )}
              <MessageBubble message={message} />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
