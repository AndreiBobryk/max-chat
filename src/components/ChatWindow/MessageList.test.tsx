import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
  const onRetry = vi.fn()
  const view = render(<MessageList messages={messages} now={NOW} onRetry={onRetry} />)
  return { ...view, onRetry }
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

  it('says that a message failed even when the reason is unknown', () => {
    renderList([outgoing('failed')])

    expect(screen.getByText('Сообщение не отправлено')).toBeInTheDocument()
  })

  it('offers to retry a failed message', async () => {
    const { onRetry } = renderList([
      outgoing('sent', { localId: 'out:1', text: 'Дошло' }),
      outgoing('failed', { localId: 'out:2', text: 'Не дошло', error: 'Нет соединения' }),
    ])

    const buttons = screen.getAllByRole('button', { name: 'Повторить' })
    expect(buttons).toHaveLength(1)
    await userEvent.setup().click(buttons[0])

    expect(onRetry).toHaveBeenCalledExactlyOnceWith('out:2')
  })

  it.each(['sending', 'sent', 'delivered', 'read'] as const)(
    'does not offer to retry a %s message',
    (status) => {
      renderList([outgoing(status)])

      expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    },
  )

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

  it('shows the caption of an unsupported attachment under the placeholder', () => {
    renderList([incoming({ kind: 'unsupported', text: 'Подпись к фото' })])

    const paragraphs = [...(rowOf('Подпись к фото')?.querySelectorAll('p') ?? [])]
    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
      'Сообщение этого типа не поддерживается',
      'Подпись к фото',
    ])
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
