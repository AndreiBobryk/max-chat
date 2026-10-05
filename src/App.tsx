import { ChatScreen } from './components/ChatScreen/ChatScreen.tsx'
import { LoginForm } from './components/LoginForm/LoginForm.tsx'
import { ChatProvider } from './state/ChatProvider.tsx'
import { useSession } from './state/session.ts'
import { SessionProvider } from './state/SessionProvider.tsx'

function Screens() {
  const { session, status } = useSession()
  // While signing in, the chats are already being polled but the login form stays on screen.
  const showChat = session !== null && status !== 'signingIn'

  return (
    <>
      {session && (
        <ChatProvider key={session.idInstance} session={session}>
          {showChat && <ChatScreen />}
        </ChatProvider>
      )}
      {!showChat && <LoginForm />}
    </>
  )
}

function App() {
  return (
    <SessionProvider>
      <Screens />
    </SessionProvider>
  )
}

export default App
