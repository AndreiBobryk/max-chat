import { useSession } from '../../state/session.ts'
import type { ConnectionStatus as Status } from '../../state/session.ts'
import styles from './ConnectionStatus.module.css'

const LABELS: Partial<Record<Status, string>> = {
  connecting: 'Подключение…',
  reconnecting: 'Нет соединения, переподключаемся…',
}

// Says when incoming messages are not being received right now.
export function ConnectionStatus() {
  const { status } = useSession()
  const label = LABELS[status]

  // The live region stays in the page so that a change of its text is announced.
  return (
    <p role="status" className={styles.status}>
      {label && (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          {label}
        </>
      )}
    </p>
  )
}
