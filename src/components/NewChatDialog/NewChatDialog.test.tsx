import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewChatDialog } from './NewChatDialog.tsx'

function renderDialog() {
  const onCreate = vi.fn()
  const onCancel = vi.fn()
  render(<NewChatDialog onCreate={onCreate} onCancel={onCancel} />)
  return { onCreate, onCancel, user: userEvent.setup() }
}

const phoneField = () => screen.getByLabelText('Номер телефона')
const submitButton = () => screen.getByRole('button', { name: 'Создать чат' })

describe('NewChatDialog', () => {
  it('is a labelled modal dialog with the phone field focused', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Новый чат' })).toHaveAttribute('aria-modal', 'true')
    expect(phoneField()).toHaveFocus()
  })

  it('keeps the button disabled until something is typed', async () => {
    const { user } = renderDialog()
    expect(submitButton()).toBeDisabled()

    await user.type(phoneField(), '7')

    expect(submitButton()).toBeEnabled()
  })

  it.each(['123', 'abc', '12025550123'])('rejects "%s" with an explanation', async (input) => {
    const { onCreate, user } = renderDialog()

    await user.type(phoneField(), input)
    await user.click(submitButton())

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Поддерживаются номера РФ (+7) и РБ (+375)')
    expect(phoneField()).toBeInvalid()
  })

  it.each([
    { input: '79991234567', phone: '79991234567' },
    { input: '+7 (999) 123-45-67', phone: '79991234567' },
    { input: '8 999 123 45 67', phone: '79991234567' },
    { input: '+375 29 123-45-67', phone: '375291234567' },
  ])('creates a chat for "$input" with the number normalized', async ({ input, phone }) => {
    const { onCreate, user } = renderDialog()

    await user.type(phoneField(), input)
    await user.click(submitButton())

    expect(onCreate).toHaveBeenCalledExactlyOnceWith(phone)
  })

  it('creates the chat when Enter is pressed', async () => {
    const { onCreate, user } = renderDialog()

    await user.type(phoneField(), '79991234567{Enter}')

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('79991234567')
  })

  it('hides the error as soon as the number is edited', async () => {
    const { user } = renderDialog()
    await user.type(phoneField(), '123{Enter}')
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(phoneField(), '4')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const { onCancel, user } = renderDialog()

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('closes on a click outside but not on a click inside', async () => {
    const { onCancel, user } = renderDialog()
    const dialog = screen.getByRole('dialog')

    await user.click(dialog)
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(dialog.parentElement!)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('keeps Tab inside the dialog', async () => {
    const { user } = renderDialog()
    await user.type(phoneField(), '7')

    await user.tab()
    expect(submitButton()).toHaveFocus()
    await user.tab()
    expect(phoneField()).toHaveFocus()
    await user.tab({ shift: true })
    expect(submitButton()).toHaveFocus()
  })
})
