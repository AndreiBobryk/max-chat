import { describeInstanceState, describeQuotaNotice } from '../../domain/errorMessages.ts'
import { useChat } from '../../state/chat.ts'
import styles from './Notices.module.css'

// What the instance reports about itself: its authorization state and the tariff quota.
export function Notices() {
  const { instanceState, quotaNotice, dismissQuotaNotice } = useChat()
  const stateText = instanceState === null ? null : describeInstanceState(instanceState)

  if (stateText === null && quotaNotice === null) return null

  return (
    <div className={styles.notices}>
      {stateText !== null && (
        <p role="alert" className={styles.notice}>
          {stateText}
        </p>
      )}
      {quotaNotice !== null && (
        <p role="alert" className={styles.notice}>
          <span className={styles.text}>{describeQuotaNotice(quotaNotice)}</span>
          <button
            type="button"
            className={styles.dismiss}
            aria-label="Скрыть уведомление"
            onClick={dismissQuotaNotice}
          >
            ×
          </button>
        </p>
      )}
    </div>
  )
}
