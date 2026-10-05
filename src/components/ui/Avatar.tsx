import styles from './Avatar.module.css'
import { UserIcon } from './icons.tsx'

const COLOR_COUNT = 6

type AvatarProps = {
  // Picks the colour, so the same chat always gets the same one.
  seed: string
  name?: string
  size?: 'large' | 'small'
}

function colorIndex(seed: string): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003
  return hash % COLOR_COUNT
}

function initials(name: string | undefined): string {
  if (!name) return ''
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('')
}

export function Avatar({ seed, name, size = 'large' }: AvatarProps) {
  const letters = initials(name)
  return (
    <span className={`${styles.avatar} ${styles[size]} ${styles[`color${colorIndex(seed)}`]}`} aria-hidden="true">
      {letters || <UserIcon size={size === 'large' ? 24 : 18} />}
    </span>
  )
}
