import { useId, useState } from 'react'
import { useSession } from '../../state/session.ts'
import controls from '../ui/controls.module.css'
import styles from './LoginForm.module.css'

type FieldErrors = {
  idInstance?: string
  apiTokenInstance?: string
}

function validate(idInstance: string, apiTokenInstance: string): FieldErrors {
  const errors: FieldErrors = {}
  if (idInstance === '') errors.idInstance = 'Введите idInstance'
  else if (!/^\d+$/.test(idInstance)) errors.idInstance = 'idInstance состоит только из цифр'
  if (apiTokenInstance === '') errors.apiTokenInstance = 'Введите apiTokenInstance'
  else if (/\s/.test(apiTokenInstance)) {
    errors.apiTokenInstance = 'apiTokenInstance не содержит пробелов'
  }
  return errors
}

export function LoginForm() {
  const { status, error, signIn } = useSession()
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const id = useId()
  const isSigningIn = status === 'signingIn'

  function submit() {
    if (isSigningIn) return
    const credentials = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
    }
    const found = validate(credentials.idInstance, credentials.apiTokenInstance)
    setErrors(found)
    if (Object.keys(found).length === 0) signIn(credentials)
  }

  return (
    <main className={`${styles.page} chat-background`}>
      <form
        className={styles.card}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <h1 className={styles.title}>Вход</h1>
        <p className={styles.lead}>Введите данные инстанса из личного кабинета GREEN-API</p>

        <div className={styles.row}>
          <label className={controls.label} htmlFor={`${id}-instance`}>
            idInstance
          </label>
          <input
            id={`${id}-instance`}
            className={controls.field}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={idInstance}
            onChange={(event) => setIdInstance(event.target.value)}
            aria-invalid={errors.idInstance ? true : undefined}
            aria-describedby={errors.idInstance ? `${id}-instance-error` : undefined}
          />
          {errors.idInstance && (
            <p id={`${id}-instance-error`} className={controls.fieldError}>
              {errors.idInstance}
            </p>
          )}
        </div>

        <div className={styles.row}>
          <label className={controls.label} htmlFor={`${id}-token`}>
            apiTokenInstance
          </label>
          <input
            id={`${id}-token`}
            className={controls.field}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiTokenInstance}
            onChange={(event) => setApiTokenInstance(event.target.value)}
            aria-invalid={errors.apiTokenInstance ? true : undefined}
            aria-describedby={errors.apiTokenInstance ? `${id}-token-error` : undefined}
          />
          {errors.apiTokenInstance && (
            <p id={`${id}-token-error`} className={controls.fieldError}>
              {errors.apiTokenInstance}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <button type="submit" className={controls.primaryButton} disabled={isSigningIn}>
          {isSigningIn ? 'Подключение…' : 'Войти'}
        </button>

        <details className={styles.hint}>
          <summary>Что настроить в личном кабинете</summary>
          <ul>
            <li>Инстанс авторизован в MAX: QR-код отсканирован.</li>
            <li>Поле webhookUrl пустое.</li>
            <li>Включены уведомления о входящих сообщениях.</li>
            <li>
              Включены уведомления о статусах отправленных сообщений и о сообщениях, отправленных
              через API.
            </li>
          </ul>
        </details>
      </form>
    </main>
  )
}
