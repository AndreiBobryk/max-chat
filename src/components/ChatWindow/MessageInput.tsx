import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { MAX_MESSAGE_LENGTH } from '../../api/greenApi.ts'
import { SendIcon } from '../ui/icons.tsx'
import styles from './MessageInput.module.css'

type MessageInputProps = {
  // Receives the trimmed text; never called with an empty or an overlong one.
  onSend: (text: string) => void
}

export function MessageInput({ onSend }: MessageInputProps) {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const message = text.trim()
  const isTooLong = message.length > MAX_MESSAGE_LENGTH
  const canSend = message !== '' && !isTooLong

  // Grow with the text; the CSS max-height turns further growth into scrolling.
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [text])

  function submit() {
    if (!canSend) return
    onSend(message)
    setText('')
    field.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line; Enter that confirms an IME candidate does neither.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {isTooLong && (
        <p role="alert" className={styles.limit}>
          Слишком длинное сообщение: {message.length} из {MAX_MESSAGE_LENGTH} символов
        </p>
      )}
      <div className={styles.bar}>
        <textarea
          ref={field}
          className={styles.field}
          rows={1}
          autoFocus
          placeholder="Сообщение"
          aria-label="Сообщение"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className={styles.send} aria-label="Отправить" disabled={!canSend}>
          <SendIcon size={18} />
        </button>
      </div>
    </form>
  )
}
