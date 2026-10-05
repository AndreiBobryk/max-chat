import { useEffect, useState } from 'react'

const REFRESH_MS = 60_000

// The current time as state, so that "today" in dates stays right while the page is open.
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  return now
}
