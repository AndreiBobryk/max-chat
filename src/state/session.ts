import { createContext, useContext } from 'react'
import type { PollerStatus } from '../api/poller.ts'

export type Credentials = {
  idInstance: string
  apiTokenInstance: string
}

export type Session = Credentials & {
  apiUrl: string
}

// signingIn: a fresh login waiting for its first answer, the login form is still shown.
// connecting: a saved session being resumed after a page reload.
export type ConnectionStatus = 'signedOut' | 'signingIn' | 'connecting' | 'online' | 'reconnecting'

export type SessionContextValue = {
  session: Session | null
  status: ConnectionStatus
  // Why the last sign-in failed or the last session ended.
  error: string | null
  signIn: (credentials: Credentials) => void
  signOut: () => void
  // For the component that owns the polling loop.
  reportPollerStatus: (status: PollerStatus) => void
  reportPollerFailure: (error: unknown) => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (value === null) throw new Error('useSession must be used inside SessionProvider')
  return value
}
