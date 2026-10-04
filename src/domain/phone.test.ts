import { describe, expect, it } from 'vitest'
import { formatPhone, isValidPhone, normalizePhone, toSendChatId } from './phone.ts'

describe('normalizePhone', () => {
  it.each([
    { input: '79991234567', phone: '79991234567' },
    { input: '+7 (999) 123-45-67', phone: '79991234567' },
    { input: '8 999 123 45 67', phone: '79991234567' },
    { input: '375291234567', phone: '375291234567' },
    { input: '+375 (29) 123-45-67', phone: '375291234567' },
    { input: '8 029 123-45-67', phone: '375291234567' },
    { input: '  79991234567  ', phone: '79991234567' },
    { input: 'abc', phone: '' },
    { input: '', phone: '' },
  ])('turns "$input" into "$phone"', ({ input, phone }) => {
    expect(normalizePhone(input)).toBe(phone)
  })
})

describe('isValidPhone', () => {
  it.each(['79991234567', '375291234567'])('accepts %s', (phone) => {
    expect(isValidPhone(phone)).toBe(true)
  })

  it.each([
    { phone: '', reason: 'empty' },
    { phone: '123', reason: 'too short' },
    { phone: '7999123456', reason: 'one digit short' },
    { phone: '799912345678', reason: 'one digit long' },
    { phone: '37529123456', reason: 'Belarus, one digit short' },
    { phone: '12025550123', reason: 'another country' },
    { phone: '89991234567', reason: 'not normalized' },
  ])('rejects "$phone" ($reason)', ({ phone }) => {
    expect(isValidPhone(phone)).toBe(false)
  })
})

describe('toSendChatId', () => {
  it('appends the @c.us suffix', () => {
    expect(toSendChatId('79991234567')).toBe('79991234567@c.us')
  })
})

describe('formatPhone', () => {
  it.each([
    { phone: '79991234567', formatted: '+7 999 123-45-67' },
    { phone: '375291234567', formatted: '+375 29 123-45-67' },
    { phone: '12025550123', formatted: '+12025550123' },
  ])('formats $phone as $formatted', ({ phone, formatted }) => {
    expect(formatPhone(phone)).toBe(formatted)
  })
})
