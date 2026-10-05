import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SessionContext } from '../../state/session.ts'
import type { SessionContextValue } from '../../state/session.ts'
import { LoginForm } from './LoginForm.tsx'

function renderForm(overrides: Partial<SessionContextValue> = {}) {
  const value: SessionContextValue = {
    session: null,
    status: 'signedOut',
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    reportPollerStatus: vi.fn(),
    reportPollerFailure: vi.fn(),
    ...overrides,
  }
  render(
    <SessionContext value={value}>
      <LoginForm />
    </SessionContext>,
  )
  return { value, user: userEvent.setup() }
}

const idField = () => screen.getByLabelText('idInstance')
const tokenField = () => screen.getByLabelText('apiTokenInstance')
const submitButton = () => screen.getByRole('button', { name: 'Войти' })

describe('LoginForm', () => {
  it('does not sign in with empty fields and says what is missing', async () => {
    const { value, user } = renderForm()

    await user.click(submitButton())

    expect(value.signIn).not.toHaveBeenCalled()
    expect(screen.getByText('Введите idInstance')).toBeInTheDocument()
    expect(screen.getByText('Введите apiTokenInstance')).toBeInTheDocument()
    expect(idField()).toBeInvalid()
    expect(tokenField()).toBeInvalid()
  })

  it('rejects an idInstance that is not a number', async () => {
    const { value, user } = renderForm()

    await user.type(idField(), '31abc')
    await user.type(tokenField(), 'token')
    await user.click(submitButton())

    expect(value.signIn).not.toHaveBeenCalled()
    expect(screen.getByText('idInstance состоит только из цифр')).toBeInTheDocument()
  })

  it('rejects a token with a space inside', async () => {
    const { value, user } = renderForm()

    await user.type(idField(), '3100000001')
    await user.type(tokenField(), 'to ken')
    await user.click(submitButton())

    expect(value.signIn).not.toHaveBeenCalled()
    expect(screen.getByText('apiTokenInstance не содержит пробелов')).toBeInTheDocument()
  })

  it('signs in with the values trimmed', async () => {
    const { value, user } = renderForm()

    await user.type(idField(), '  3100000001 ')
    await user.type(tokenField(), ' token ')
    await user.click(submitButton())

    expect(value.signIn).toHaveBeenCalledExactlyOnceWith({
      idInstance: '3100000001',
      apiTokenInstance: 'token',
    })
  })

  it('signs in when Enter is pressed in a field', async () => {
    const { value, user } = renderForm()

    await user.type(idField(), '3100000001')
    await user.type(tokenField(), 'token{Enter}')

    expect(value.signIn).toHaveBeenCalledOnce()
  })

  it('clears a field error once the value is corrected', async () => {
    const { user } = renderForm()
    await user.click(submitButton())
    expect(screen.getByText('Введите idInstance')).toBeInTheDocument()

    await user.type(idField(), '3100000001')
    await user.type(tokenField(), 'token')
    await user.click(submitButton())

    expect(screen.queryByText('Введите idInstance')).not.toBeInTheDocument()
    expect(idField()).toBeValid()
  })

  it('shows why signing in failed', () => {
    renderForm({ error: 'Не удалось войти: проверьте idInstance и apiTokenInstance' })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось войти: проверьте idInstance и apiTokenInstance',
    )
  })

  it('shows progress and blocks a second attempt while signing in', async () => {
    const { value, user } = renderForm({ status: 'signingIn' })
    const button = screen.getByRole('button', { name: 'Подключение…' })

    expect(button).toBeDisabled()
    await user.type(tokenField(), 'token{Enter}')
    expect(value.signIn).not.toHaveBeenCalled()
  })

  it('masks the token', () => {
    renderForm()

    expect(tokenField()).toHaveAttribute('type', 'password')
  })
})
