import { GreenApiError } from '../api/errors.ts'

export const INTERRUPTED_SEND_ERROR = 'Отправка была прервана'

const INSTANCE_EXPIRED = 'Срок действия инстанса истёк. Продлите тариф в личном кабинете GREEN-API'

// Why signing in, or an established session, could not go on.
export function describeConnectError(error: unknown): string {
  if (!(error instanceof GreenApiError)) return 'Не удалось подключиться. Повторите попытку'

  switch (error.kind) {
    case 'unauthorized':
    case 'forbidden':
    case 'notFound':
      return 'Не удалось войти: проверьте idInstance и apiTokenInstance'
    case 'badRequest':
      return describeRejectedConnection(error.serverText)
    case 'network':
      return 'Нет соединения с GREEN-API. Проверьте подключение к интернету и повторите попытку'
    case 'timeout':
      return 'Сервис GREEN-API не ответил вовремя. Повторите попытку'
    case 'rateLimit':
      return 'Слишком много запросов. Повторите попытку через несколько секунд'
    case 'server':
      return 'Сервис GREEN-API временно недоступен. Повторите попытку позже'
    default:
      return 'Не удалось подключиться. Повторите попытку'
  }
}

function describeRejectedConnection(serverText: string): string {
  if (/webhook/i.test(serverText)) {
    return 'В настройках инстанса задан webhookUrl. Очистите его в личном кабинете GREEN-API'
  }
  if (/expired/i.test(serverText)) return INSTANCE_EXPIRED
  if (/deleted/i.test(serverText)) return 'Инстанс удалён. Проверьте idInstance'
  if (/starting|not authorized/i.test(serverText)) {
    return 'Инстанс запускается или не авторизован в MAX. Проверьте его состояние в личном кабинете GREEN-API и повторите попытку'
  }
  // receiveNotification answers 400 when a webhook URL is set, so that is the likeliest cause.
  return withServerText(
    'Сервис отклонил запрос. Проверьте, что в настройках инстанса не задан webhookUrl',
    serverText,
  )
}

// Why sendMessage failed; shown under the message.
export function describeSendError(error: unknown): string {
  if (!(error instanceof GreenApiError)) return 'Не удалось отправить сообщение'

  switch (error.kind) {
    case 'badRequest':
      if (/starting|not authorized/i.test(error.serverText)) {
        return 'Инстанс не авторизован в MAX. Отсканируйте QR-код в личном кабинете GREEN-API'
      }
      if (/expired/i.test(error.serverText)) return INSTANCE_EXPIRED
      return withServerText('Сервис отклонил сообщение', error.serverText)
    case 'unauthorized':
      return 'Учётные данные больше не действуют. Войдите заново'
    case 'forbidden':
      return /suspended/i.test(error.serverText)
        ? 'Отправка временно ограничена мессенджером'
        : 'Нет доступа к инстансу. Войдите заново'
    case 'quota':
      return withServerText('Лимит тарифа Developer: 3 чата в месяц', error.serverText)
    case 'rateLimit':
      return 'Слишком много запросов. Повторите отправку'
    case 'server':
      return 'Сервис временно недоступен'
    case 'network':
      return 'Нет соединения'
    case 'timeout':
      return 'Сервис не ответил вовремя'
    default:
      return 'Не удалось отправить сообщение'
  }
}

// Why a message that was accepted for sending did not reach the recipient.
export function describeDeliveryFailure(status: 'failed' | 'noAccount'): string {
  return status === 'noAccount' ? 'У этого номера нет аккаунта MAX' : 'Сообщение не доставлено'
}

function withServerText(text: string, serverText: string): string {
  return serverText ? `${text}. Ответ сервера: ${serverText}` : text
}
