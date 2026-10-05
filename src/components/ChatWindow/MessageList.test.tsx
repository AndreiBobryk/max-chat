import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Message, OutgoingStatus } from '../../domain/chatReducer.ts'
import { MessageList } from './MessageList.tsx'

const at = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 9, day, hours, minutes).getTime()

const NOW = at(5, 15, 30)

function incoming(overrides: Partial<Message> = {}): Message {
  return {
    localId: 'in:1',
    idMessage: '1',
    direction: 'in',
    kind: 'text',
    text: 'Ответ',
    timestamp: at(5, 12, 5),
    ...overrides,
  } as Message
}

function outgoing(status: OutgoingStatus = 'sent', overrides: Partial<Message> = {}): Message {
  return {
    localId: 'out:1',
    direction: 'out',
    kind: 'text',
    text: 'Привет',
    timestamp: at(5, 12, 0),
    status,
    ...overrides,
  } as Message
}

function renderList(messages: Message[]) {
  return render(<MessageList messages={messages} now={NOW} />)
}

const rowOf = (text: string) => screen.getByText(text).closest('[data-direction]')

describe('MessageList', () => {
  it('shows an invitation to write when there are no messages', () => {
    renderList([])

    expect(screen.getByText('Сообщений пока нет')).toBeInTheDocument()
  })

  it('tells incoming and outgoing messages apart', () => {
    renderList([outgoing(), incoming()])

    expect(rowOf('Привет')).toHaveAttribute('data-direction', 'out')
    expect(rowOf('Ответ')).toHaveAttribute('data-direction', 'in')
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.queryByText('Сообщений пока нет')).not.toBeInTheDocument()
  })

  it('shows the time of each message', () => {
    renderList([outgoing(), incoming()])

    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText('12:05')).toBeInTheDocument()
  })

  it.each([
    { status: 'sending', label: 'Отправляется' },
    { status: 'sent', label: 'Отправлено' },
    { status: 'delivered', label: 'Доставлено' },
    { status: 'read', label: 'Прочитано' },
    { status: 'failed', label: 'Не отправлено' },
  ] as const)('marks a $status message as "$label"', ({ status, label }) => {
    renderList([outgoing(status)])

    expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
  })

  it('explains why a message failed', () => {
    renderList([outgoing('failed', { error: 'Нет соединения' })])

    expect(screen.getByText('Нет соединения')).toBeInTheDocument()
  })

  it('shows markup in a message as plain text', () => {
    const text = '<b>жирный</b><script>alert(1)</script>'
    const { container } = renderList([incoming({ text })])

    expect(screen.getByText(text)).toBeInTheDocument()
    expect(container.querySelector('b, script')).toBeNull()
  })

  it('keeps the line breaks of a message', () => {
    renderList([incoming({ text: 'Первая\nВторая' })])

    expect(rowOf('Первая Вторая')?.querySelector('p')?.textContent).toBe('Первая\nВторая')
  })

  it('shows a placeholder for a message of an unsupported type', () => {
    renderList([incoming({ kind: 'unsupported', text: '' })])

    expect(screen.getByText('Сообщение этого типа не поддерживается')).toBeInTheDocument()
  })

  it('separates the messages of different days', () => {
    renderList([
      incoming({ localId: 'in:1', text: 'Позавчера', timestamp: at(3, 10) }),
      incoming({ localId: 'in:2', text: 'Вчера утром', timestamp: at(4, 9) }),
      incoming({ localId: 'in:3', text: 'Вчера вечером', timestamp: at(4, 21) }),
      incoming({ localId: 'in:4', text: 'Только что', timestamp: at(5, 15) }),
    ])

    const log = screen.getByRole('log', { name: 'Сообщения' })
    const labels = [...log.querySelectorAll('span')]
      .map((element) => element.textContent)
      .filter((text) => ['3 октября', 'Вчера', 'Сегодня'].includes(text ?? ''))
    expect(labels).toEqual(['3 октября', 'Вчера', 'Сегодня'])
  })
})
