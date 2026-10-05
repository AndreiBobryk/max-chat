import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { fakeGreenApi } from './test/fakeGreenApi.ts'
import { incomingText } from './test/fixtures/notifications.ts'
import { server } from './test/server.ts'

const ALLOWED_METHODS = /\/waInstance\d+\/(sendMessage|receiveNotification|deleteNotification)\//

// Every request the app makes, whether or not a handler exists for it.
let requestedUrls: string[] = []

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  requestedUrls = []
  server.events.on('request:start', ({ request }) => {
    requestedUrls.push(request.url)
  })
  // A developer's .env.local must not redirect the tests to another host.
  vi.stubEnv('VITE_GREEN_API_URL', '')
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.unstubAllEnvs()
})

async function signIn(api: ReturnType<typeof fakeGreenApi>) {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByLabelText('idInstance'), api.credentials.idInstance)
  await user.type(screen.getByLabelText('apiTokenInstance'), api.credentials.apiTokenInstance)
  await user.click(screen.getByRole('button', { name: 'Войти' }))
  await screen.findByRole('heading', { name: 'Чаты' })
  return user
}

async function createChat(user: ReturnType<typeof userEvent.setup>, phone: string) {
  await user.click(screen.getByRole('button', { name: 'Новый чат' }))
  await user.type(screen.getByLabelText('Номер телефона'), `${phone}{Enter}`)
}

describe('App', () => {
  it('starts with the login form', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
    expect(requestedUrls).toEqual([])
  })

  it('lets the user sign in, start a chat, send a message and see the reply', async () => {
    const api = fakeGreenApi()
    const user = await signIn(api)
    expect(screen.queryByRole('heading', { name: 'Вход' })).not.toBeInTheDocument()

    await createChat(user, '+7 (987) 654-32-10')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '+7 987 654-32-10' })).toBeInTheDocument()
    const messageField = screen.getByRole('textbox', { name: 'Сообщение' })
    expect(messageField).toHaveFocus()

    await user.type(messageField, 'Тест{Enter}')
    const log = screen.getByRole('log', { name: 'Сообщения' })
    expect(within(log).getByText('Тест')).toBeInTheDocument()
    await within(log).findByRole('img', { name: 'Отправлено' })
    expect(api.calls).toContainEqual({
      method: 'sendMessage',
      body: { chatId: '79876543210@c.us', message: 'Тест' },
    })

    const receiptId = api.notify({
      ...incomingText,
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Ответ' } },
    })
    expect(await within(log).findByText('Ответ')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Иван Петров' })).toBeInTheDocument()
    await waitFor(() => expect(api.calls).toContainEqual({ method: 'deleteNotification', receiptId }))

    expect(within(screen.getByRole('list', { name: 'Чаты' })).getAllByRole('button')).toHaveLength(1)
    expect(requestedUrls.length).toBeGreaterThan(3)
    expect(requestedUrls.filter((url) => !ALLOWED_METHODS.test(url))).toEqual([])
  })

  it('stays on the login form with the reason and the entered values when sign-in fails', async () => {
    server.use(
      http.all('https://3100.api.green-api.com/*', () => new HttpResponse(null, { status: 401 })),
    )
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('idInstance'), '3100000001')
    await user.type(screen.getByLabelText('apiTokenInstance'), 'wrong-token')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось войти: проверьте idInstance и apiTokenInstance',
    )
    expect(screen.getByLabelText('idInstance')).toHaveValue('3100000001')
    expect(screen.getByLabelText('apiTokenInstance')).toHaveValue('wrong-token')
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Чаты' })).not.toBeInTheDocument()
  })

  it('opens the existing chat when the same number is entered again', async () => {
    const api = fakeGreenApi()
    const user = await signIn(api)

    await createChat(user, '79876543210')
    await user.click(screen.getByRole('button', { name: 'Закрыть чат' }))
    expect(screen.queryByRole('textbox', { name: 'Сообщение' })).not.toBeInTheDocument()
    await createChat(user, '8 987 654 32 10')

    expect(within(screen.getByRole('list', { name: 'Чаты' })).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveFocus()
    expect(api.count('sendMessage')).toBe(0)
  })

  it('returns the focus to the "+" button when the dialog is cancelled', async () => {
    const api = fakeGreenApi()
    const user = await signIn(api)

    await user.click(screen.getByRole('button', { name: 'Новый чат' }))
    expect(screen.getByRole('dialog', { name: 'Новый чат' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Новый чат' })).toHaveFocus()
  })

  it('counts a message that arrives in a chat that is not open', async () => {
    const api = fakeGreenApi()
    const user = await signIn(api)

    api.notify(incomingText)
    const list = await screen.findByRole('list', { name: 'Чаты' })
    const item = within(list).getByRole('button')
    expect(within(item).getByLabelText('Непрочитанных: 1')).toBeInTheDocument()
    expect(item).toHaveTextContent('Привет')

    await user.click(item)

    expect(within(item).queryByLabelText(/Непрочитанных/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('log')).getByText('Привет')).toBeInTheDocument()
  })

  it('returns to the login form and stops polling on sign-out', async () => {
    const api = fakeGreenApi()
    const user = await signIn(api)

    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    const requestsAtSignOut = requestedUrls.length
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(requestedUrls).toHaveLength(requestsAtSignOut)
    expect(sessionStorage.length).toBe(0)
  })
})
