import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Chat, Message } from '../../domain/chatReducer.ts'
import { ChatList } from './ChatList.tsx'

const NOW = new Date(2026, 9, 5, 15, 30).getTime()
const TODAY = new Date(2026, 9, 5, 12, 5).getTime()
const EARLIER = new Date(2026, 9, 3, 18, 0).getTime()

const named: Chat = {
  key: 'phone:79991234567',
  phone: '79991234567',
  sendChatId: '79991234567@c.us',
  maxChatId: '10000000',
  name: 'Иван Петров',
  unread: 3,
  lastMessageAt: TODAY,
}

const unnamed: Chat = {
  key: 'phone:375291234567',
  phone: '375291234567',
  sendChatId: '375291234567@c.us',
  unread: 0,
  lastMessageAt: EARLIER,
}

const empty: Chat = { ...unnamed, key: 'phone:79990000000', phone: '79990000000' }

const messages: Record<string, Message[]> = {
  [named.key]: [
    { localId: 'a', direction: 'out', kind: 'text', text: 'Привет', timestamp: TODAY, status: 'sent' },
    { localId: 'b', idMessage: '1', direction: 'in', kind: 'text', text: 'Ответ', timestamp: TODAY },
  ],
  [unnamed.key]: [
    { localId: 'c', direction: 'out', kind: 'text', text: 'Вопрос', timestamp: EARLIER, status: 'read' },
  ],
  [empty.key]: [],
}

function renderList(activeChatKey: string | null = null) {
  const onSelect = vi.fn()
  render(
    <ChatList
      chats={[named, unnamed, empty]}
      messages={messages}
      activeChatKey={activeChatKey}
      now={NOW}
      onSelect={onSelect}
    />,
  )
  return { onSelect, user: userEvent.setup() }
}

const items = () => within(screen.getByRole('list', { name: 'Чаты' })).getAllByRole('button')

describe('ChatList', () => {
  it('shows the chats in the given order with their titles', () => {
    renderList()

    expect(items()).toHaveLength(3)
    expect(items()[0]).toHaveTextContent('Иван Петров')
    expect(items()[1]).toHaveTextContent('+375 29 123-45-67')
    expect(items()[2]).toHaveTextContent('+7 999 000-00-00')
  })

  it('previews the last message and marks an own one', () => {
    renderList()

    expect(items()[0]).toHaveTextContent('Ответ')
    expect(items()[0]).not.toHaveTextContent('Вы:')
    expect(items()[1]).toHaveTextContent('Вы: Вопрос')
    expect(items()[2]).toHaveTextContent('Сообщений пока нет')
  })

  it('shows the time for today and the date for earlier days', () => {
    renderList()

    expect(items()[0]).toHaveTextContent('12:05')
    expect(items()[1]).toHaveTextContent('3 окт.')
  })

  it('shows the unread counter only where there is something unread', () => {
    renderList()

    expect(within(items()[0]).getByLabelText('Непрочитанных: 3')).toHaveTextContent('3')
    expect(within(items()[1]).queryByLabelText(/Непрочитанных/)).not.toBeInTheDocument()
  })

  it('marks the open chat', () => {
    renderList(unnamed.key)

    expect(items()[1]).toHaveAttribute('aria-current', 'true')
    expect(items()[0]).not.toHaveAttribute('aria-current')
  })

  it('opens a chat on click', async () => {
    const { onSelect, user } = renderList()

    await user.click(items()[1])

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(unnamed.key)
  })
})
