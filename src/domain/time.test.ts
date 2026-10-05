import { describe, expect, it } from 'vitest'
import { formatDayLabel, formatListTime, formatTime, isSameDay } from './time.ts'

// Local time on purpose: the functions format in the user's time zone.
const at = (year: number, month: number, day: number, hours = 12, minutes = 0) =>
  new Date(year, month - 1, day, hours, minutes).getTime()

const NOW = at(2026, 10, 5, 15, 30)

describe('formatTime', () => {
  it('shows hours and minutes in 24-hour form', () => {
    expect(formatTime(at(2026, 10, 5, 9, 5))).toBe('09:05')
    expect(formatTime(at(2026, 10, 5, 23, 38))).toBe('23:38')
  })
})

describe('isSameDay', () => {
  it('compares calendar days, not 24-hour spans', () => {
    expect(isSameDay(at(2026, 10, 5, 0, 1), at(2026, 10, 5, 23, 59))).toBe(true)
    expect(isSameDay(at(2026, 10, 4, 23, 59), at(2026, 10, 5, 0, 1))).toBe(false)
  })
})

describe('formatListTime', () => {
  it('shows the time for a message from today', () => {
    expect(formatListTime(at(2026, 10, 5, 9, 5), NOW)).toBe('09:05')
  })

  it.each([
    { date: at(2026, 10, 3), expected: '3 окт.' },
    { date: at(2026, 5, 30), expected: '30 мая' },
  ])('shows the date $expected for an older message', ({ date, expected }) => {
    expect(formatListTime(date, NOW)).toBe(expected)
  })
})

describe('formatDayLabel', () => {
  it.each([
    { name: 'today', date: at(2026, 10, 5, 0, 1), expected: 'Сегодня' },
    { name: 'yesterday', date: at(2026, 10, 4, 23, 59), expected: 'Вчера' },
    { name: 'earlier this year', date: at(2026, 7, 7), expected: '7 июля' },
    { name: 'another year', date: at(2025, 12, 31), expected: '31 декабря 2025' },
  ])('labels $name as "$expected"', ({ date, expected }) => {
    expect(formatDayLabel(date, NOW)).toBe(expected)
  })
})
