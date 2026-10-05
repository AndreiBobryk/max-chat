const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const shortDateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const longDateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const fullDateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

export function formatTime(timestamp: number): string {
  return timeFormat.format(timestamp)
}

// For the chat list: the time of today's message, the date of an older one.
export function formatListTime(timestamp: number, now: number): string {
  return isSameDay(timestamp, now) ? formatTime(timestamp) : shortDateFormat.format(timestamp)
}

// For the separators between days in a conversation.
export function formatDayLabel(timestamp: number, now: number): string {
  const day = startOfDay(timestamp)
  const today = startOfDay(now)
  if (day === today) return 'Сегодня'
  if (day === startOfDay(today - 1)) return 'Вчера'
  if (new Date(timestamp).getFullYear() === new Date(now).getFullYear()) {
    return longDateFormat.format(timestamp)
  }
  // The Russian locale appends "г." to a date with a year.
  return fullDateFormat.format(timestamp).replace(/\s*г\.$/, '')
}
