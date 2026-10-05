import { act, render, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FALLBACK_API_URL } from '../api/greenApi.ts'
import { INTERRUPTED_SEND_ERROR } from '../domain/errorMessages.ts'
import { fakeGreenApi } from '../test/fakeGreenApi.ts'
import {
  CHAT_ID,
  incomingImage,
  incomingText,
  outgoingStatus,
  SENDER_PHONE,
} from '../test/fixtures/notifications.ts'
import { server } from '../test/server.ts'
import { ChatProvider } from './ChatProvider.tsx'
import { useChat } from './chat.ts'
import type { ChatContextValue } from './chat.ts'
import { SessionProvider } from './SessionProvider.tsx'
import { useSession } from './session.ts'
import type { SessionContextValue } from './session.ts'
import { loadChatState, loadSession, saveSession } from './storage.ts'

const INSTANCE_HOST = 'https://3100.api.green-api.com'
const CHAT_KEY = `phone:${SENDER_PHONE}`
const AUTO_KEY = `id:${CHAT_ID}`

// What the providers currently expose, captured after every render.
const probe: { session: SessionContextValue | null; chat: ChatContextValue | null } = {
  session: null,
  chat: null,
}

function ChatProbe() {
  const value = useChat()
  useEffect(() => {
    probe.chat = value
  })
  return null
}

function Harness() {
  const value = useSession()
  useEffect(() => {
    probe.session = value
    if (value.session === null) probe.chat = null
  })
  if (value.session === null) return null
  return (
    <ChatProvider key={value.session.idInstance} session={value.session}>
      <ChatProbe />
    </ChatProvider>
  )
}

const session = () => probe.session!
const chat = () => probe.chat!
const messages = (chatKey = CHAT_KEY) => chat().state.messages[chatKey]

function start() {
  return render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  )
}

async function signIn(api: ReturnType<typeof fakeGreenApi>) {
  act(() => session().signIn(api.credentials))
  await waitFor(() => expect(session().status).toBe('online'))
}

function respondEverywhere(host: string, resolver: () => Response) {
  server.use(http.all(`${host}/*`, resolver))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  probe.session = null
  probe.chat = null
  // A developer's .env.local must not redirect the tests to another host.
  vi.stubEnv('VITE_GREEN_API_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('signing in', () => {
  it('goes online and stores the session once the first request succeeds', async () => {
    const api = fakeGreenApi()
    start()
    expect(session().status).toBe('signedOut')

    act(() => session().signIn(api.credentials))
    expect(session().status).toBe('signingIn')
    expect(loadSession()).toBeNull()

    await waitFor(() => expect(session().status).toBe('online'))
    expect(loadSession()).toEqual({ ...api.credentials, apiUrl: INSTANCE_HOST })
    expect(api.calls[0]).toEqual({ method: 'receiveNotification', receiveTimeout: '5' })
  })

  it('stays signed out with a reason when the credentials are rejected', async () => {
    respondEverywhere(INSTANCE_HOST, () => new HttpResponse(null, { status: 401 }))
    start()

    act(() => session().signIn({ idInstance: '3100000001', apiTokenInstance: 'wrong' }))

    await waitFor(() => expect(session().status).toBe('signedOut'))
    expect(session().error).toBe('Не удалось войти: проверьте idInstance и apiTokenInstance')
    expect(session().session).toBeNull()
    expect(loadSession()).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('falls back to the generic host when the instance host is unreachable', async () => {
    respondEverywhere(INSTANCE_HOST, () => HttpResponse.error())
    const api = fakeGreenApi({ apiUrl: FALLBACK_API_URL })
    start()

    await signIn(api)

    expect(session().session?.apiUrl).toBe(FALLBACK_API_URL)
    expect(loadSession()?.apiUrl).toBe(FALLBACK_API_URL)
  })

  it('reports no connection when every host is unreachable', async () => {
    respondEverywhere(INSTANCE_HOST, () => HttpResponse.error())
    respondEverywhere(FALLBACK_API_URL, () => HttpResponse.error())
    start()

    act(() => session().signIn({ idInstance: '3100000001', apiTokenInstance: 'token' }))

    await waitFor(() => expect(session().status).toBe('signedOut'))
    expect(session().error).toContain('Нет соединения')
  })
})

describe('receiving', () => {
  it('handles and deletes a notification that comes with the very first request', async () => {
    const api = fakeGreenApi()
    const receiptId = api.notify(incomingText)
    start()

    await signIn(api)

    await waitFor(() => expect(messages(AUTO_KEY)).toHaveLength(1))
    expect(messages(AUTO_KEY)[0]).toMatchObject({ direction: 'in', text: 'Привет' })
    await waitFor(() => expect(api.calls).toContainEqual({ method: 'deleteNotification', receiptId }))
  })

  it('puts a reply into the chat created by phone number', async () => {
    const api = fakeGreenApi()
    start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))

    const receiptId = api.notify(incomingText)

    await waitFor(() => expect(messages()).toHaveLength(1))
    expect(messages()[0]).toMatchObject({ direction: 'in', text: 'Привет' })
    expect(Object.keys(chat().state.chats)).toEqual([CHAT_KEY])
    await waitFor(() => expect(api.calls).toContainEqual({ method: 'deleteNotification', receiptId }))
  })

  it('keeps the queue moving past notifications it cannot show', async () => {
    const api = fakeGreenApi()
    start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))

    api.notify({ typeWebhook: 'incomingCall', from: 'somewhere' })
    api.notify('not even an object')
    api.notify({ ...incomingImage, idMessage: 'image-1' })
    api.notify({ ...incomingText, idMessage: 'text-1' })

    await waitFor(() => expect(messages()).toHaveLength(2))
    expect(messages().map((message) => message.kind)).toEqual(['unsupported', 'text'])
    await waitFor(() => expect(api.count('deleteNotification')).toBe(4))
  })
})

describe('sending', () => {
  it('sends to the phone-number chat id and marks the message as sent', async () => {
    const api = fakeGreenApi()
    start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))

    act(() => chat().sendMessage(CHAT_KEY, '  Привет  '))
    expect(messages()[0]).toMatchObject({ direction: 'out', text: 'Привет', status: 'sending' })

    await waitFor(() => expect(messages()[0]).toMatchObject({ status: 'sent', idMessage: 'out-1' }))
    expect(api.calls.filter((call) => call.method === 'sendMessage')).toEqual([
      { method: 'sendMessage', body: { chatId: `${SENDER_PHONE}@c.us`, message: 'Привет' } },
    ])
  })

  it('shows why sending failed and sends again on retry', async () => {
    const api = fakeGreenApi()
    api.onSend(() =>
      HttpResponse.json(
        { quotaData: { status: 'CORRESPONDENTS_QUOTA_EXCEEDED', description: 'Monthly quota has been exceeded' } },
        { status: 466 },
      ),
    )
    start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))

    act(() => chat().sendMessage(CHAT_KEY, 'Привет'))
    await waitFor(() => expect(messages()[0]).toMatchObject({ status: 'failed' }))
    expect(messages()[0]).toMatchObject({
      error: 'Лимит тарифа Developer: 3 чата в месяц. Ответ сервера: Monthly quota has been exceeded',
    })

    api.onSend(() => HttpResponse.json({ idMessage: 'out-retry' }))
    act(() => chat().retryMessage(messages()[0].localId))

    await waitFor(() => expect(messages()[0]).toMatchObject({ status: 'sent', idMessage: 'out-retry' }))
    expect(messages()).toHaveLength(1)
    expect(api.count('sendMessage')).toBe(2)
  })

  it('sends the messages of a chat one at a time, in order', async () => {
    const api = fakeGreenApi()
    const order: string[] = []
    api.onSend(async ({ message }) => {
      order.push(`start:${message}`)
      await delay(20)
      order.push(`end:${message}`)
      return HttpResponse.json({ idMessage: `id-${message}` })
    })
    start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))

    act(() => chat().sendMessage(CHAT_KEY, 'a'))
    act(() => chat().sendMessage(CHAT_KEY, 'b'))
    act(() => chat().sendMessage(CHAT_KEY, 'c'))

    await waitFor(() =>
      expect(messages().map((message) => message.idMessage)).toEqual(['id-a', 'id-b', 'id-c']),
    )
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c'])
  })

  it('marks the message as failed when the recipient has no MAX account', async () => {
    const api = fakeGreenApi()
    start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))
    act(() => chat().sendMessage(CHAT_KEY, 'Привет'))
    await waitFor(() => expect(messages()[0]).toMatchObject({ status: 'sent' }))

    api.notify({ ...outgoingStatus('noAccount'), idMessage: 'out-1' })

    await waitFor(() => expect(messages()[0]).toMatchObject({ status: 'failed' }))
    expect(messages()[0]).toMatchObject({ error: 'У этого номера нет аккаунта MAX' })
    expect(chat().state.chats[CHAT_KEY].maxChatId).toBe(CHAT_ID)
  })

  it('does not send an empty or an overlong message', async () => {
    const api = fakeGreenApi()
    start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))

    act(() => chat().sendMessage(CHAT_KEY, '   \n '))
    act(() => chat().sendMessage(CHAT_KEY, 'я'.repeat(4001)))
    await delay(100)

    expect(messages()).toEqual([])
    expect(api.count('sendMessage')).toBe(0)
  })
})

describe('persistence', () => {
  it('restores the session and the history after a reload', async () => {
    const api = fakeGreenApi()
    const page = start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))
    api.notify(incomingText)
    await waitFor(() => expect(messages()).toHaveLength(1))

    page.unmount()
    start()

    expect(session().status).toBe('connecting')
    expect(messages()).toHaveLength(1)
    expect(chat().state.activeChatKey).toBe(CHAT_KEY)
    await waitFor(() => expect(session().status).toBe('online'))
  })

  it('marks a send that the reload interrupted as failed', async () => {
    const api = fakeGreenApi()
    api.onSend(async () => {
      await delay('infinite')
      return HttpResponse.json({ idMessage: 'never' })
    })
    const page = start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))
    act(() => chat().sendMessage(CHAT_KEY, 'Привет'))
    await waitFor(() => expect(api.count('sendMessage')).toBe(1))

    page.unmount()
    start()

    expect(messages()[0]).toMatchObject({ status: 'failed', error: INTERRUPTED_SEND_ERROR })
  })

  it('keeps a resumed session and reconnects while the network is down', async () => {
    saveSession({ idInstance: '3100000001', apiTokenInstance: 'token', apiUrl: INSTANCE_HOST })
    respondEverywhere(INSTANCE_HOST, () => HttpResponse.error())

    start()

    expect(session().status).toBe('connecting')
    await waitFor(() => expect(session().status).toBe('reconnecting'))
    expect(session().session).not.toBeNull()
    expect(loadSession()).not.toBeNull()
  })
})

describe('ending the session', () => {
  it('stops polling, forgets the credentials and keeps the history on sign-out', async () => {
    const api = fakeGreenApi()
    start()
    await signIn(api)
    act(() => chat().createChat(SENDER_PHONE))

    act(() => session().signOut())
    const requestsAtSignOut = api.calls.length
    await delay(200)

    expect(session().status).toBe('signedOut')
    expect(session().error).toBeNull()
    expect(probe.chat).toBeNull()
    expect(loadSession()).toBeNull()
    expect(api.calls).toHaveLength(requestsAtSignOut)
    expect(Object.keys(loadChatState(api.credentials.idInstance).chats)).toEqual([CHAT_KEY])
  })

  it('returns to the signed-out state with a reason when the credentials stop working', async () => {
    const api = fakeGreenApi()
    start()
    await signIn(api)

    respondEverywhere(INSTANCE_HOST, () => new HttpResponse(null, { status: 401 }))

    await waitFor(() => expect(session().status).toBe('signedOut'))
    expect(session().error).toBe('Не удалось войти: проверьте idInstance и apiTokenInstance')
    expect(loadSession()).toBeNull()
  })
})
