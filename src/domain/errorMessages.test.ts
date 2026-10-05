import { describe, expect, it } from 'vitest'
import { GreenApiError } from '../api/errors.ts'
import type { GreenApiErrorKind } from '../api/errors.ts'
import {
  describeConnectError,
  describeDeliveryFailure,
  describeInstanceState,
  describeQuotaNotice,
  describeSendError,
} from './errorMessages.ts'

function apiError(kind: GreenApiErrorKind, serverText = ''): GreenApiError {
  return new GreenApiError(kind, { serverText })
}

describe('describeConnectError', () => {
  it.each(['unauthorized', 'forbidden', 'notFound'] as const)(
    'blames the credentials for %s',
    (kind) => {
      expect(describeConnectError(apiError(kind))).toBe(
        'Не удалось войти: проверьте idInstance и apiTokenInstance',
      )
    },
  )

  it.each([
    { serverText: 'Message cannot be received (webhook set)', expected: 'задан webhookUrl' },
    { serverText: 'Instance account is expired', expected: 'Срок действия инстанса истёк' },
    { serverText: 'Instance is deleted', expected: 'Инстанс удалён' },
    { serverText: 'instance is starting or not authorized', expected: 'не авторизован в MAX' },
    { serverText: 'instance in starting process try later', expected: 'Инстанс запускается' },
  ])('explains a 400 saying "$serverText"', ({ serverText, expected }) => {
    expect(describeConnectError(apiError('badRequest', serverText))).toContain(expected)
  })

  it('points at webhookUrl and quotes the server for any other 400', () => {
    expect(describeConnectError(apiError('badRequest', 'bad request data'))).toBe(
      'Сервис отклонил запрос. Проверьте, что в настройках инстанса не задан webhookUrl. Ответ сервера: bad request data',
    )
  })

  it.each([
    { kind: 'network', expected: 'Нет соединения' },
    { kind: 'timeout', expected: 'не ответил вовремя' },
    { kind: 'rateLimit', expected: 'Слишком много запросов' },
    { kind: 'server', expected: 'временно недоступен' },
    { kind: 'unknown', expected: 'Не удалось подключиться' },
  ] as const)('describes $kind', ({ kind, expected }) => {
    expect(describeConnectError(apiError(kind))).toContain(expected)
  })

  it('describes an error that did not come from the API', () => {
    expect(describeConnectError(new TypeError('boom'))).toBe(
      'Не удалось подключиться. Повторите попытку',
    )
  })
})

describe('describeSendError', () => {
  it.each([
    {
      name: 'an instance that is not authorized',
      error: apiError('badRequest', 'instance is starting or not authorized'),
      expected: 'Инстанс не авторизован в MAX. Отсканируйте QR-код в личном кабинете GREEN-API',
    },
    {
      name: 'an expired instance',
      error: apiError('badRequest', 'Instance account is expired'),
      expected: 'Срок действия инстанса истёк. Продлите тариф в личном кабинете GREEN-API',
    },
    {
      name: 'a rejected message',
      error: apiError('badRequest', 'Validation failed'),
      expected: 'Сервис отклонил сообщение. Ответ сервера: Validation failed',
    },
    {
      name: 'a rejected message without details',
      error: apiError('badRequest'),
      expected: 'Сервис отклонил сообщение',
    },
    {
      name: 'the chat quota',
      error: apiError('quota', 'Monthly quota has been exceeded'),
      expected: 'Лимит тарифа Developer: 3 чата в месяц. Ответ сервера: Monthly quota has been exceeded',
    },
    {
      name: 'a suspended account',
      error: apiError('forbidden', 'Your account is suspended'),
      expected: 'Отправка временно ограничена мессенджером',
    },
    {
      name: 'a 403 for another reason',
      error: apiError('forbidden'),
      expected: 'Нет доступа к инстансу. Войдите заново',
    },
    {
      name: 'credentials that stopped working',
      error: apiError('unauthorized'),
      expected: 'Учётные данные больше не действуют. Войдите заново',
    },
    { name: 'a rate limit', error: apiError('rateLimit'), expected: 'Слишком много запросов. Повторите отправку' },
    { name: 'a server failure', error: apiError('server'), expected: 'Сервис временно недоступен' },
    { name: 'no network', error: apiError('network'), expected: 'Нет соединения' },
    { name: 'a timeout', error: apiError('timeout'), expected: 'Сервис не ответил вовремя' },
    { name: 'an unexpected response', error: apiError('unknown'), expected: 'Не удалось отправить сообщение' },
    { name: 'an error that did not come from the API', error: new TypeError('boom'), expected: 'Не удалось отправить сообщение' },
  ])('describes $name', ({ error, expected }) => {
    expect(describeSendError(error)).toBe(expected)
  })
})

describe('describeInstanceState', () => {
  it('has nothing to say about an authorized instance', () => {
    expect(describeInstanceState('authorized')).toBeNull()
  })

  it.each([
    { state: 'notAuthorized', expected: 'Инстанс не авторизован в MAX' },
    { state: 'starting', expected: 'Инстанс запускается' },
    { state: 'blocked', expected: 'Аккаунт MAX заблокирован' },
    { state: 'suspended', expected: 'временно ограничил отправку' },
    { state: 'pendingPassword', expected: 'пароль двухфакторной авторизации' },
    { state: 'somethingNew', expected: 'Состояние инстанса: somethingNew' },
  ])('explains the "$state" state', ({ state, expected }) => {
    expect(describeInstanceState(state)).toContain(expected)
  })
})

describe('describeQuotaNotice', () => {
  it('names the limit and quotes the server', () => {
    expect(describeQuotaNotice('Only send/receive from: 10000000')).toBe(
      'Лимит тарифа Developer: 3 чата в месяц. Ответ сервера: Only send/receive from: 10000000',
    )
  })

  it('names the limit when the server gave no details', () => {
    expect(describeQuotaNotice('')).toBe('Лимит тарифа Developer: 3 чата в месяц')
  })
})

describe('describeDeliveryFailure', () => {
  it('names a missing MAX account', () => {
    expect(describeDeliveryFailure('noAccount')).toBe('У этого номера нет аккаунта MAX')
  })

  it('reports a failed delivery', () => {
    expect(describeDeliveryFailure('failed')).toBe('Сообщение не доставлено')
  })
})
