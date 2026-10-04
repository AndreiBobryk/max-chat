import { describe, expect, it } from 'vitest'
import {
  chatReducer,
  chatTitle,
  initialChatState,
  MAX_PENDING_UPDATES,
  selectChatList,
} from './chatReducer.ts'
import type { ChatAction, ChatState, ReportedStatus } from './chatReducer.ts'

const PHONE = '79991234567'
const CHAT_KEY = `phone:${PHONE}`
const MAX_ID = '10000000'
const AUTO_KEY = `id:${MAX_ID}`

const created: ChatAction = { type: 'chatCreated', phone: PHONE, now: 1000 }
const queued: ChatAction = {
  type: 'messageQueued',
  chatKey: CHAT_KEY,
  localId: 'm1',
  text: 'Привет',
  now: 1100,
}
const sent: ChatAction = { type: 'messageSent', localId: 'm1', idMessage: 'out-1' }

function run(actions: ChatAction[], state: ChatState = initialChatState): ChatState {
  return actions.reduce(chatReducer, state)
}

function incoming(
  overrides: Partial<Extract<ChatAction, { type: 'incomingReceived' }>> = {},
): ChatAction {
  return {
    type: 'incomingReceived',
    idMessage: 'in-1',
    chatId: MAX_ID,
    senderPhone: PHONE,
    senderName: 'Иван',
    timestamp: 2000,
    kind: 'text',
    text: 'Ответ',
    ...overrides,
  }
}

function status(reported: ReportedStatus, error?: string): ChatAction {
  return { type: 'statusReceived', idMessage: 'out-1', chatId: MAX_ID, status: reported, error }
}

describe('creating a chat', () => {
  it('creates the chat and opens it', () => {
    const state = run([created])

    expect(state.chats).toEqual({
      [CHAT_KEY]: {
        key: CHAT_KEY,
        phone: PHONE,
        sendChatId: '79991234567@c.us',
        unread: 0,
        lastMessageAt: 1000,
      },
    })
    expect(state.messages[CHAT_KEY]).toEqual([])
    expect(state.activeChatKey).toBe(CHAT_KEY)
  })

  it('opens the existing chat instead of creating a duplicate', () => {
    const state = run([
      created,
      { type: 'chatSelected', key: null },
      { type: 'chatCreated', phone: PHONE, now: 5000 },
    ])

    expect(Object.keys(state.chats)).toEqual([CHAT_KEY])
    expect(state.chats[CHAT_KEY].lastMessageAt).toBe(1000)
    expect(state.activeChatKey).toBe(CHAT_KEY)
  })

  it('opens a chat that an incoming message created for the same phone', () => {
    const state = run([incoming(), created])

    expect(Object.keys(state.chats)).toEqual([AUTO_KEY])
    expect(state.activeChatKey).toBe(AUTO_KEY)
  })
})

describe('sending', () => {
  it('adds the message as sending', () => {
    const state = run([created, queued])

    expect(state.messages[CHAT_KEY]).toEqual([
      {
        localId: 'm1',
        direction: 'out',
        kind: 'text',
        text: 'Привет',
        timestamp: 1100,
        status: 'sending',
      },
    ])
    expect(state.chats[CHAT_KEY].lastMessageAt).toBe(1100)
  })

  it('marks the message as sent and keeps idMessage', () => {
    const state = run([created, queued, sent])

    expect(state.messages[CHAT_KEY][0]).toMatchObject({ status: 'sent', idMessage: 'out-1' })
  })

  it('marks the message as failed with the error text', () => {
    const state = run([created, queued, { type: 'messageFailed', localId: 'm1', error: 'Нет соединения' }])

    expect(state.messages[CHAT_KEY][0]).toMatchObject({ status: 'failed', error: 'Нет соединения' })
  })

  it('retries a failed message as a new send at the end of the chat', () => {
    const state = run([
      created,
      queued,
      { type: 'messageQueued', chatKey: CHAT_KEY, localId: 'm2', text: 'Второе', now: 1200 },
      { type: 'messageFailed', localId: 'm1', error: 'Нет соединения' },
      { type: 'messageRetried', localId: 'm1', now: 1300 },
    ])

    expect(state.messages[CHAT_KEY].map((message) => message.localId)).toEqual(['m2', 'm1'])
    expect(state.messages[CHAT_KEY][1]).toEqual({
      localId: 'm1',
      direction: 'out',
      kind: 'text',
      text: 'Привет',
      timestamp: 1300,
      status: 'sending',
    })
  })

  it('does not retry a message that has not failed', () => {
    const before = run([created, queued, sent])

    expect(chatReducer(before, { type: 'messageRetried', localId: 'm1', now: 1300 })).toBe(before)
  })

  it('ignores a message for a chat that does not exist', () => {
    const before = run([created])
    const action: ChatAction = { ...queued, chatKey: 'phone:70000000000' }

    expect(chatReducer(before, action)).toBe(before)
  })
})

describe('receiving', () => {
  it('finds the chat by phone number and remembers its MAX chat id', () => {
    const state = run([created, incoming()])

    expect(Object.keys(state.chats)).toEqual([CHAT_KEY])
    expect(state.chats[CHAT_KEY]).toMatchObject({ maxChatId: MAX_ID, name: 'Иван', lastMessageAt: 2000 })
    expect(state.messages[CHAT_KEY]).toEqual([
      {
        localId: 'in:in-1',
        idMessage: 'in-1',
        direction: 'in',
        kind: 'text',
        text: 'Ответ',
        timestamp: 2000,
      },
    ])
  })

  it('finds the chat by its MAX chat id when the phone number is hidden', () => {
    const state = run([created, incoming(), incoming({ idMessage: 'in-2', senderPhone: null })])

    expect(Object.keys(state.chats)).toEqual([CHAT_KEY])
    expect(state.messages[CHAT_KEY]).toHaveLength(2)
  })

  it('creates a chat for an unknown sender with a hidden phone number', () => {
    const state = run([created, incoming({ senderPhone: null })])

    expect(Object.keys(state.chats)).toEqual([CHAT_KEY, AUTO_KEY])
    expect(state.chats[AUTO_KEY]).toEqual({
      key: AUTO_KEY,
      sendChatId: MAX_ID,
      maxChatId: MAX_ID,
      name: 'Иван',
      unread: 1,
      lastMessageAt: 2000,
    })
    expect(state.messages[AUTO_KEY]).toHaveLength(1)
    expect(state.messages[CHAT_KEY]).toEqual([])
  })

  it('keeps a message of an unsupported type', () => {
    const state = run([created, incoming({ kind: 'unsupported', text: '' })])

    expect(state.messages[CHAT_KEY][0]).toMatchObject({ kind: 'unsupported', text: '' })
  })

  it('ignores a notification that was already processed', () => {
    const before = run([created, incoming()])

    expect(chatReducer(before, incoming())).toBe(before)
  })
})

describe('binding a chat by idMessage', () => {
  it('learns the MAX chat id from the echo of a sent message', () => {
    const state = run([
      created,
      queued,
      sent,
      { type: 'chatBound', idMessage: 'out-1', chatId: MAX_ID },
      incoming({ senderPhone: null }),
    ])

    expect(Object.keys(state.chats)).toEqual([CHAT_KEY])
    expect(state.chats[CHAT_KEY].maxChatId).toBe(MAX_ID)
    expect(state.messages[CHAT_KEY]).toHaveLength(2)
  })

  it('learns the MAX chat id from a status notification', () => {
    const state = run([created, queued, sent, status('delivered')])

    expect(state.chats[CHAT_KEY].maxChatId).toBe(MAX_ID)
    expect(state.messages[CHAT_KEY][0]).toMatchObject({ status: 'delivered' })
  })

  it('applies a notification that arrived before sendMessage returned', () => {
    const early = run([created, queued, status('delivered')])

    expect(early.pendingUpdates).toHaveLength(1)
    expect(early.chats[CHAT_KEY].maxChatId).toBeUndefined()

    const state = chatReducer(early, sent)

    expect(state.pendingUpdates).toEqual([])
    expect(state.chats[CHAT_KEY].maxChatId).toBe(MAX_ID)
    expect(state.messages[CHAT_KEY][0]).toMatchObject({ status: 'delivered', idMessage: 'out-1' })
  })

  it('keeps only the latest notifications that match no message', () => {
    const actions: ChatAction[] = Array.from({ length: MAX_PENDING_UPDATES + 5 }, (_, index) => ({
      type: 'chatBound',
      idMessage: `foreign-${index}`,
      chatId: MAX_ID,
    }))

    const state = run(actions)

    expect(state.pendingUpdates).toHaveLength(MAX_PENDING_UPDATES)
    expect(state.pendingUpdates[0].idMessage).toBe('foreign-5')
  })
})

describe('merging two chats of the same person', () => {
  const actions: ChatAction[] = [
    created,
    queued,
    sent,
    incoming({ senderPhone: null, timestamp: 1500 }),
    { type: 'messageQueued', chatKey: CHAT_KEY, localId: 'm2', text: 'Ещё', now: 1800 },
  ]

  it('moves the messages into the chat created by phone, ordered by time', () => {
    const before = run(actions)
    expect(Object.keys(before.chats)).toEqual([CHAT_KEY, AUTO_KEY])

    const state = chatReducer(before, status('delivered'))

    expect(Object.keys(state.chats)).toEqual([CHAT_KEY])
    expect(Object.keys(state.messages)).toEqual([CHAT_KEY])
    expect(state.messages[CHAT_KEY].map((message) => message.localId)).toEqual(['m1', 'in:in-1', 'm2'])
    expect(state.chats[CHAT_KEY]).toMatchObject({
      maxChatId: MAX_ID,
      sendChatId: '79991234567@c.us',
      name: 'Иван',
      unread: 0,
      lastMessageAt: 1800,
    })
  })

  it('carries the unread counter over when neither chat is open', () => {
    const state = run([...actions, { type: 'chatSelected', key: null }, status('delivered')])

    expect(state.chats[CHAT_KEY].unread).toBe(1)
  })

  it('keeps the merged chat open when the removed one was open', () => {
    const state = run([...actions, { type: 'chatSelected', key: AUTO_KEY }, status('delivered')])

    expect(state.activeChatKey).toBe(CHAT_KEY)
  })
})

describe('unread counter', () => {
  it('grows only while the chat is not open and resets when it is opened', () => {
    const closed = run([
      created,
      { type: 'chatSelected', key: null },
      incoming(),
      incoming({ idMessage: 'in-2' }),
    ])
    expect(closed.chats[CHAT_KEY].unread).toBe(2)

    const opened = chatReducer(closed, { type: 'chatSelected', key: CHAT_KEY })
    expect(opened.chats[CHAT_KEY].unread).toBe(0)

    const whileOpen = chatReducer(opened, incoming({ idMessage: 'in-3' }))
    expect(whileOpen.chats[CHAT_KEY].unread).toBe(0)
  })
})

describe('delivery status', () => {
  const base = [created, queued, sent]

  it('moves forward from sent to delivered to read', () => {
    const state = run([...base, status('delivered'), status('read')])

    expect(state.messages[CHAT_KEY][0]).toMatchObject({ status: 'read' })
  })

  it('never moves backwards', () => {
    const state = run([...base, status('read'), status('delivered'), status('sent')])

    expect(state.messages[CHAT_KEY][0]).toMatchObject({ status: 'read' })
  })

  it('marks a sent message as failed with the reason', () => {
    const state = run([...base, status('failed', 'У этого номера нет аккаунта MAX')])

    expect(state.messages[CHAT_KEY][0]).toMatchObject({
      status: 'failed',
      error: 'У этого номера нет аккаунта MAX',
    })
  })

  it('ignores a failure reported after delivery', () => {
    const state = run([...base, status('delivered'), status('failed', 'Ошибка')])

    expect(state.messages[CHAT_KEY][0]).toMatchObject({ status: 'delivered' })
    expect(state.messages[CHAT_KEY][0]).not.toHaveProperty('error', 'Ошибка')
  })

  it('clears the error when delivery is confirmed after a failure', () => {
    const state = run([...base, status('failed', 'Ошибка'), status('delivered')])

    expect(state.messages[CHAT_KEY][0]).toMatchObject({ status: 'delivered', error: undefined })
  })
})

describe('selectChatList', () => {
  it('orders chats by the time of the last message, newest first', () => {
    const state = run([
      created,
      { type: 'chatCreated', phone: '375291234567', now: 1500 },
      incoming({ timestamp: 3000 }),
    ])

    expect(selectChatList(state).map((chat) => chat.key)).toEqual([CHAT_KEY, 'phone:375291234567'])
  })
})

describe('chatTitle', () => {
  it('prefers the sender name', () => {
    expect(chatTitle(run([created, incoming()]).chats[CHAT_KEY])).toBe('Иван')
  })

  it('falls back to the formatted phone number', () => {
    expect(chatTitle(run([created]).chats[CHAT_KEY])).toBe('+7 999 123-45-67')
  })

  it('falls back to the chat id when there is neither a name nor a phone', () => {
    const state = run([incoming({ senderPhone: null, senderName: '' })])

    expect(chatTitle(state.chats[AUTO_KEY])).toBe(MAX_ID)
  })
})
