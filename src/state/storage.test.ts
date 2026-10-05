import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatReducer, initialChatState } from '../domain/chatReducer.ts'
import type { ChatAction, ChatState } from '../domain/chatReducer.ts'
import { INTERRUPTED_SEND_ERROR } from '../domain/errorMessages.ts'
import {
  clearSession,
  loadChatState,
  loadSession,
  MAX_STORED_MESSAGES,
  saveHistory,
  saveSession,
} from './storage.ts'

const ID_INSTANCE = '3100000001'
const HISTORY_KEY = `max-chat:v1:${ID_INSTANCE}`
const SESSION_KEY = 'max-chat:session'
const CHAT_KEY = 'phone:79991234567'

const session = {
  idInstance: ID_INSTANCE,
  apiTokenInstance: 'token',
  apiUrl: 'https://3100.api.green-api.com',
}

function build(actions: ChatAction[]): ChatState {
  return actions.reduce(chatReducer, initialChatState)
}

const settled = build([
  { type: 'chatCreated', phone: '79991234567', now: 1000 },
  { type: 'messageQueued', chatKey: CHAT_KEY, localId: 'm1', text: 'Привет', now: 1100 },
  { type: 'messageSent', localId: 'm1', idMessage: 'out-1' },
  {
    type: 'incomingReceived',
    idMessage: 'in-1',
    chatId: '10000000',
    senderPhone: '79991234567',
    senderName: 'Иван',
    timestamp: 2000,
    kind: 'text',
    text: 'Ответ',
  },
])

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('session', () => {
  it('is saved to sessionStorage and read back', () => {
    saveSession(session)

    expect(loadSession()).toEqual(session)
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('is absent until it is saved', () => {
    expect(loadSession()).toBeNull()
  })

  it.each([
    { name: 'corrupted JSON', raw: '{"idInstance":' },
    { name: 'a value that is not an object', raw: '"token"' },
    { name: 'a missing field', raw: JSON.stringify({ idInstance: ID_INSTANCE, apiUrl: session.apiUrl }) },
    { name: 'an empty field', raw: JSON.stringify({ ...session, apiTokenInstance: '' }) },
  ])('is ignored when storage holds $name', ({ raw }) => {
    sessionStorage.setItem(SESSION_KEY, raw)

    expect(loadSession()).toBeNull()
  })

  it('is removed on sign-out while the history stays', () => {
    saveSession(session)
    saveHistory(ID_INSTANCE, settled)

    clearSession()

    expect(loadSession()).toBeNull()
    expect(loadChatState(ID_INSTANCE).chats).toEqual(settled.chats)
  })
})

describe('history', () => {
  it('is saved to localStorage and read back', () => {
    saveHistory(ID_INSTANCE, settled)

    expect(loadChatState(ID_INSTANCE)).toEqual(settled)
    expect(localStorage.getItem(HISTORY_KEY)).not.toBeNull()
  })

  it('is empty until something is saved', () => {
    expect(loadChatState(ID_INSTANCE)).toBe(initialChatState)
  })

  it('is kept separately for each instance', () => {
    saveHistory(ID_INSTANCE, settled)

    expect(loadChatState('3100000002')).toBe(initialChatState)
  })

  it('does not keep notifications that are waiting for their message', () => {
    const state = chatReducer(settled, { type: 'chatBound', idMessage: 'foreign', chatId: '10000001' })
    expect(state.pendingUpdates).toHaveLength(1)

    saveHistory(ID_INSTANCE, state)

    expect(loadChatState(ID_INSTANCE).pendingUpdates).toEqual([])
  })

  it('marks a message that was still being sent as interrupted', () => {
    const state = chatReducer(settled, {
      type: 'messageQueued',
      chatKey: CHAT_KEY,
      localId: 'm2',
      text: 'Ещё',
      now: 3000,
    })

    saveHistory(ID_INSTANCE, state)

    expect(loadChatState(ID_INSTANCE).messages[CHAT_KEY][2]).toMatchObject({
      localId: 'm2',
      status: 'failed',
      error: INTERRUPTED_SEND_ERROR,
    })
  })

  it(`keeps the last ${MAX_STORED_MESSAGES} messages of a chat`, () => {
    const incoming: ChatAction[] = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, index) => ({
      type: 'incomingReceived',
      idMessage: `in-${index}`,
      chatId: '10000000',
      senderPhone: '79991234567',
      senderName: 'Иван',
      timestamp: 2000 + index,
      kind: 'text',
      text: `Сообщение ${index}`,
    }))

    saveHistory(ID_INSTANCE, build([{ type: 'chatCreated', phone: '79991234567', now: 1000 }, ...incoming]))
    const messages = loadChatState(ID_INSTANCE).messages[CHAT_KEY]

    expect(messages).toHaveLength(MAX_STORED_MESSAGES)
    expect(messages[0].idMessage).toBe('in-5')
  })
})

describe('damaged history', () => {
  it.each([
    { name: 'corrupted JSON', raw: '{"version":1,"chats":' },
    { name: 'a value that is not an object', raw: '[1,2,3]' },
    { name: 'another version', raw: JSON.stringify({ version: 2, chats: {}, messages: {} }) },
    { name: 'chats that are not a record', raw: JSON.stringify({ version: 1, chats: [], messages: {} }) },
    { name: 'no messages', raw: JSON.stringify({ version: 1, chats: {} }) },
  ])('gives an empty state for $name', ({ raw }) => {
    localStorage.setItem(HISTORY_KEY, raw)

    expect(loadChatState(ID_INSTANCE)).toBe(initialChatState)
  })

  it('drops entries that are not valid and keeps the rest', () => {
    const valid = settled.chats[CHAT_KEY]
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({
        version: 1,
        chats: {
          [CHAT_KEY]: valid,
          broken: { key: 'broken', unread: 0 },
          misplaced: { ...valid, key: 'somewhere-else' },
        },
        messages: {
          [CHAT_KEY]: [
            ...settled.messages[CHAT_KEY],
            { localId: 'x', direction: 'sideways', kind: 'text', text: '', timestamp: 1 },
            { localId: 'y', direction: 'out', kind: 'text', text: '', timestamp: 1, status: 'lost' },
            'not a message',
          ],
          broken: [],
        },
        activeChatKey: 'broken',
      }),
    )

    expect(loadChatState(ID_INSTANCE)).toEqual({ ...settled, activeChatKey: null })
  })
})

describe('unavailable storage', () => {
  it('does not throw when writing fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })

    expect(() => saveSession(session)).not.toThrow()
    expect(() => saveHistory(ID_INSTANCE, settled)).not.toThrow()
  })

  it('gives nothing when reading fails', () => {
    saveSession(session)
    saveHistory(ID_INSTANCE, settled)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access is denied', 'SecurityError')
    })

    expect(loadSession()).toBeNull()
    expect(loadChatState(ID_INSTANCE)).toBe(initialChatState)
  })

  it('does not throw when clearing fails', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Access is denied', 'SecurityError')
    })

    expect(() => clearSession()).not.toThrow()
  })
})
