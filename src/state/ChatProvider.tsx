import { useEffect, useEffectEvent, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { createGreenApiClient, MAX_MESSAGE_LENGTH } from '../api/greenApi.ts'
import { startNotificationPoller } from '../api/poller.ts'
import { chatActionFromEvent } from '../domain/chatActions.ts'
import { chatReducer } from '../domain/chatReducer.ts'
import { describeSendError } from '../domain/errorMessages.ts'
import { parseNotification } from '../domain/notifications.ts'
import { ChatContext } from './chat.ts'
import type { ChatContextValue } from './chat.ts'
import { useSession } from './session.ts'
import type { Session } from './session.ts'
import { loadChatState, saveHistory } from './storage.ts'

let localIdCounter = 0

function createLocalId(): string {
  localIdCounter += 1
  return `out:${Date.now().toString(36)}-${localIdCounter}`
}

type ChatProviderProps = {
  session: Session
  children: ReactNode
}

// Owns the chats of one instance: mount it with key={session.idInstance}.
export function ChatProvider({ session, children }: ChatProviderProps) {
  const { status, reportPollerStatus, reportPollerFailure } = useSession()
  const [state, dispatch] = useReducer(chatReducer, session.idInstance, loadChatState)
  const client = useMemo(() => createGreenApiClient(session), [session])

  const handleNotification = useEffectEvent((body: unknown) => {
    const action = chatActionFromEvent(parseNotification(body))
    if (action) dispatch(action)
  })
  const isSigningIn = useEffectEvent(() => status === 'signingIn')

  useEffect(() => {
    const controller = new AbortController()
    void startNotificationPoller({
      client,
      signal: controller.signal,
      failFast: isSigningIn(),
      onNotification: handleNotification,
      onStatus: reportPollerStatus,
      onFatal: reportPollerFailure,
    })
    return () => controller.abort()
  }, [client, reportPollerStatus, reportPollerFailure])

  // Nothing is written until something changes, so a failed sign-in leaves no trace.
  const loadedState = useRef(state)
  useEffect(() => {
    if (state !== loadedState.current) saveHistory(session.idInstance, state)
  }, [session.idInstance, state])

  const sendAbort = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    sendAbort.current = controller
    return () => controller.abort()
  }, [])

  // Messages of one chat are sent one after another so that they arrive in order.
  const sendQueues = useRef(new Map<string, Promise<void>>())

  function enqueueSend(chatKey: string, localId: string, sendChatId: string, text: string) {
    const deliver = async () => {
      const signal = sendAbort.current?.signal
      try {
        const { idMessage } = await client.sendMessage(sendChatId, text, { signal })
        dispatch({ type: 'messageSent', localId, idMessage })
      } catch (error) {
        // Left as "sending": the next load of the history marks it as interrupted.
        if (signal?.aborted) return
        dispatch({ type: 'messageFailed', localId, error: describeSendError(error) })
      }
    }
    const queue = sendQueues.current
    queue.set(chatKey, (queue.get(chatKey) ?? Promise.resolve()).then(deliver))
  }

  const value: ChatContextValue = {
    state,
    createChat: (phone) => dispatch({ type: 'chatCreated', phone, now: Date.now() }),
    selectChat: (key) => dispatch({ type: 'chatSelected', key }),
    sendMessage: (chatKey, text) => {
      const chat = state.chats[chatKey]
      const message = text.trim()
      if (!chat || message === '' || message.length > MAX_MESSAGE_LENGTH) return
      const localId = createLocalId()
      dispatch({ type: 'messageQueued', chatKey, localId, text: message, now: Date.now() })
      enqueueSend(chatKey, localId, chat.sendChatId, message)
    },
    retryMessage: (localId) => {
      for (const [chatKey, messages] of Object.entries(state.messages)) {
        const message = messages.find((candidate) => candidate.localId === localId)
        if (!message) continue
        if (message.direction !== 'out' || message.status !== 'failed') return
        dispatch({ type: 'messageRetried', localId, now: Date.now() })
        enqueueSend(chatKey, localId, state.chats[chatKey].sendChatId, message.text)
        return
      }
    },
  }

  return <ChatContext value={value}>{children}</ChatContext>
}
