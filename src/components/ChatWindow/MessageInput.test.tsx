import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MessageInput } from './MessageInput.tsx'

function renderInput() {
  const onSend = vi.fn()
  render(<MessageInput onSend={onSend} />)
  return { onSend, user: userEvent.setup() }
}

const field = () => screen.getByRole('textbox', { name: 'Сообщение' })
const sendButton = () => screen.getByRole('button', { name: 'Отправить' })

describe('MessageInput', () => {
  it('takes the focus when it appears', () => {
    renderInput()

    expect(field()).toHaveFocus()
  })

  it('sends on Enter, then clears the field and keeps the focus', async () => {
    const { onSend, user } = renderInput()

    await user.type(field(), '  Привет  {Enter}')

    expect(onSend).toHaveBeenCalledExactlyOnceWith('Привет')
    expect(field()).toHaveValue('')
    expect(field()).toHaveFocus()
  })

  it('breaks the line on Shift+Enter instead of sending', async () => {
    const { onSend, user } = renderInput()

    await user.type(field(), 'Первая{Shift>}{Enter}{/Shift}Вторая')
    expect(onSend).not.toHaveBeenCalled()
    expect(field()).toHaveValue('Первая\nВторая')

    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Первая\nВторая')
  })

  it('sends on a click on the button', async () => {
    const { onSend, user } = renderInput()

    await user.type(field(), 'Привет')
    await user.click(sendButton())

    expect(onSend).toHaveBeenCalledExactlyOnceWith('Привет')
    expect(field()).toHaveValue('')
    expect(field()).toHaveFocus()
  })

  it.each(['', '   ', '{Shift>}{Enter}{/Shift}'])('does not send "%s"', async (input) => {
    const { onSend, user } = renderInput()

    if (input !== '') await user.type(field(), input)
    expect(sendButton()).toBeDisabled()
    await user.type(field(), '{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends a message of exactly 4000 characters', async () => {
    const { onSend, user } = renderInput()
    const text = 'я'.repeat(4000)

    await user.click(field())
    await user.paste(text)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.keyboard('{Enter}')

    expect(onSend).toHaveBeenCalledExactlyOnceWith(text)
  })

  it('blocks a message of 4001 characters and says why', async () => {
    const { onSend, user } = renderInput()
    const text = 'я'.repeat(4001)

    await user.click(field())
    await user.paste(text)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Слишком длинное сообщение: 4001 из 4000 символов',
    )
    expect(sendButton()).toBeDisabled()
    await user.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(field()).toHaveValue(text)
  })
})
