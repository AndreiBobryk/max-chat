const RU_PHONE = /^7\d{10}$/
const BY_PHONE = /^375\d{9}$/

// Reduces user input to digits with a country code: "8 999 ..." is Russia, "8 029 ..." is Belarus.
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('80')) return `375${digits.slice(2)}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

// GREEN-API sends by phone number only to Russia (7) and Belarus (375).
export function isValidPhone(phone: string): boolean {
  return RU_PHONE.test(phone) || BY_PHONE.test(phone)
}

export function toSendChatId(phone: string): string {
  return `${phone}@c.us`
}

export function formatPhone(phone: string): string {
  const ru = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  if (ru) return `+7 ${ru[1]} ${ru[2]}-${ru[3]}-${ru[4]}`
  const by = /^375(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  if (by) return `+375 ${by[1]} ${by[2]}-${by[3]}-${by[4]}`
  return `+${phone}`
}
