import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { isValidPhone, normalizePhone } from '../../domain/phone.ts'
import controls from '../ui/controls.module.css'
import styles from './NewChatDialog.module.css'

type NewChatDialogProps = {
  // Receives a normalized, valid phone number.
  onCreate: (phone: string) => void
  onCancel: () => void
}

export function NewChatDialog({ onCreate, onCancel }: NewChatDialogProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const id = useId()

  function submit() {
    const phone = normalizePhone(value)
    if (!isValidPhone(phone)) {
      setError('Поддерживаются номера РФ (+7) и РБ (+375)')
      return
    }
    onCreate(phone)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    // Keep keyboard focus inside the dialog while it is open.
    const focusable = dialog.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={styles.dialog}
        onKeyDown={handleKeyDown}
      >
        <h2 id={`${id}-title`} className={styles.title}>
          Новый чат
        </h2>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label className={controls.label} htmlFor={`${id}-phone`}>
            Номер телефона
          </label>
          <input
            id={`${id}-phone`}
            className={controls.field}
            type="tel"
            autoComplete="off"
            autoFocus
            placeholder="+7 999 123-45-67"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setError(null)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          {error && (
            <p id={`${id}-error`} role="alert" className={controls.fieldError}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className={`${controls.primaryButton} ${styles.submit}`}
            disabled={value.trim() === ''}
          >
            Создать чат
          </button>
        </form>
      </div>
    </div>
  )
}
