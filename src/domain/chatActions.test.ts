import { describe, expect, it } from 'vitest'
import { chatActionFromEvent } from './chatActions.ts'
import type { NotificationEvent } from './notifications.ts'

const IDS = { idMessage: 'out-1', chatId: '10000000' }

describe('chatActionFromEvent', () => {
  it('turns an incoming message into incomingReceived', () => {
    const event: NotificationEvent = {
      type: 'incomingMessage',
      idMessage: 'in-1',
      chatId: '10000000',
      senderPhone: '79991234567',
      senderName: 'Иван',
      timestamp: 2000,
      kind: 'text',
      text: 'Привет',
    }

    expect(chatActionFromEvent(event)).toEqual({ ...event, type: 'incomingReceived' })
  })

  it('turns the echo of a sent message into chatBound', () => {
    expect(chatActionFromEvent({ type: 'outgoingEcho', ...IDS })).toEqual({ type: 'chatBound', ...IDS })
  })

  it.each(['sent', 'delivered', 'read'] as const)('passes the "%s" status on', (status) => {
    expect(chatActionFromEvent({ type: 'outgoingStatus', ...IDS, status })).toEqual({
      type: 'statusReceived',
      ...IDS,
      status,
    })
  })

  it.each([
    { status: 'failed', error: 'Сообщение не доставлено' },
    { status: 'noAccount', error: 'У этого номера нет аккаунта MAX' },
  ] as const)('turns "$status" into a failure with a reason', ({ status, error }) => {
    expect(chatActionFromEvent({ type: 'outgoingStatus', ...IDS, status })).toEqual({
      type: 'statusReceived',
      ...IDS,
      status: 'failed',
      error,
    })
  })

  it('uses an unrecognised status only to bind the chat', () => {
    expect(chatActionFromEvent({ type: 'outgoingStatus', ...IDS, status: 'unknown' })).toEqual({
      type: 'chatBound',
      ...IDS,
    })
  })

  it.each<NotificationEvent>([
    { type: 'instanceState', state: 'notAuthorized' },
    { type: 'quotaExceeded', description: 'Monthly quota exceeded' },
    { type: 'ignored' },
  ])('gives nothing for $type', (event) => {
    expect(chatActionFromEvent(event)).toBeNull()
  })
})
