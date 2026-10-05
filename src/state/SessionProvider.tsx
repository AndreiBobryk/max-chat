import { useCallback, useEffect, useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'
import { GreenApiError } from '../api/errors.ts'
import { apiUrlCandidates } from '../api/greenApi.ts'
import type { PollerStatus } from '../api/poller.ts'
import { describeConnectError } from '../domain/errorMessages.ts'
import { SessionContext } from './session.ts'
import type { ConnectionStatus, Credentials, Session, SessionContextValue } from './session.ts'
import { clearSession, loadSession, saveSession } from './storage.ts'

type SessionState = {
  session: Session | null
  status: ConnectionStatus
  // Hosts still to try if the current one turns out to be unreachable during sign-in.
  fallbackUrls: string[]
  error: string | null
}

type SessionAction =
  | { type: 'signInStarted'; session: Session; fallbackUrls: string[] }
  | { type: 'pollerStatusChanged'; status: PollerStatus }
  | { type: 'pollerFailed'; error: unknown }
  | { type: 'signedOut' }

const SIGNED_OUT: SessionState = {
  session: null,
  status: 'signedOut',
  fallbackUrls: [],
  error: null,
}

function initSessionState(): SessionState {
  const session = loadSession()
  return session ? { ...SIGNED_OUT, session, status: 'connecting' } : SIGNED_OUT
}

function isUnreachable(error: unknown): boolean {
  return error instanceof GreenApiError && (error.kind === 'network' || error.kind === 'timeout')
}

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'signInStarted':
      return {
        session: action.session,
        status: 'signingIn',
        fallbackUrls: action.fallbackUrls,
        error: null,
      }
    case 'pollerStatusChanged':
      // A loop that has just been stopped may still report.
      if (state.session === null) return state
      return { ...state, status: action.status, fallbackUrls: [] }
    case 'pollerFailed': {
      if (state.session === null) return state
      const [nextUrl, ...fallbackUrls] = state.fallbackUrls
      if (state.status === 'signingIn' && nextUrl !== undefined && isUnreachable(action.error)) {
        return { ...state, session: { ...state.session, apiUrl: nextUrl }, fallbackUrls }
      }
      return { ...SIGNED_OUT, error: describeConnectError(action.error) }
    }
    case 'signedOut':
      return SIGNED_OUT
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, initSessionState)

  // Credentials are stored only once they have been proven to work.
  useEffect(() => {
    if (state.session === null) clearSession()
    else if (state.status !== 'signingIn') saveSession(state.session)
  }, [state.session, state.status])

  const signIn = useCallback((credentials: Credentials) => {
    const [apiUrl, ...fallbackUrls] = apiUrlCandidates(
      credentials.idInstance,
      import.meta.env.VITE_GREEN_API_URL,
    )
    dispatch({ type: 'signInStarted', session: { ...credentials, apiUrl }, fallbackUrls })
  }, [])

  const signOut = useCallback(() => dispatch({ type: 'signedOut' }), [])

  const reportPollerStatus = useCallback(
    (status: PollerStatus) => dispatch({ type: 'pollerStatusChanged', status }),
    [],
  )

  const reportPollerFailure = useCallback(
    (error: unknown) => dispatch({ type: 'pollerFailed', error }),
    [],
  )

  const value = useMemo<SessionContextValue>(
    () => ({
      session: state.session,
      status: state.status,
      error: state.error,
      signIn,
      signOut,
      reportPollerStatus,
      reportPollerFailure,
    }),
    [state.session, state.status, state.error, signIn, signOut, reportPollerStatus, reportPollerFailure],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
