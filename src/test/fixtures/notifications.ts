// Built from the examples in the GREEN-API documentation, not captured from a live instance.
import type {
  InstanceData,
  MessageData,
  MessageNotification,
  OutgoingMessageStatusNotification,
  QuotaExceededNotification,
  SenderData,
  StateInstanceChangedNotification,
} from '../../api/types.ts'

export const CHAT_ID = '10000000'
export const SENDER_PHONE = '79876543210'
export const SENDER_NAME = 'Иван Петров'

const instanceData: InstanceData = {
  idInstance: 3100000000,
  wid: '79991234567@c.us',
  typeInstance: 'v3',
}

const personalSender: SenderData = {
  chatId: CHAT_ID,
  chatName: SENDER_NAME,
  chatType: 'user',
  sender: CHAT_ID,
  senderName: SENDER_NAME,
  senderType: 'user',
  senderContactName: SENDER_NAME,
  senderPhoneNumber: Number(SENDER_PHONE),
}

function incoming(messageData: MessageData, senderData: SenderData = personalSender): MessageNotification {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData,
    timestamp: 1763115112,
    idMessage: '1763115112345',
    senderData,
    messageData,
  }
}

export const incomingText = incoming({
  typeMessage: 'textMessage',
  textMessageData: { textMessage: 'Привет' },
})

export const incomingExtendedText = incoming({
  typeMessage: 'extendedTextMessage',
  extendedTextMessageData: {
    text: 'Документация на сайте https://green-api.com/',
    description: 'Сервис GREEN-API',
    title: 'Доступный MAX API',
    forwardingScore: 0,
    isForwarded: false,
  },
})

export const incomingQuoted = incoming({
  typeMessage: 'quotedMessage',
  extendedTextMessageData: {
    text: 'Цитируем это',
    stanzaId: '116413118178426437',
    participant: CHAT_ID,
  },
})

export const incomingImage = incoming({
  typeMessage: 'imageMessage',
  fileMessageData: {
    downloadUrl: 'https://example.test/image.jpg',
    caption: 'Подпись',
    fileName: 'image.jpg',
    mimeType: 'image/jpeg',
  },
})

export const incomingSticker = incoming({
  typeMessage: 'stickerMessage',
  fileMessageData: { downloadUrl: 'https://example.test/sticker.webp' },
})

export const incomingAudio = incoming({
  typeMessage: 'audioMessage',
  fileMessageData: { downloadUrl: 'https://example.test/audio.ogg' },
})

export const incomingReaction = incoming({
  typeMessage: 'reactionMessage',
  extendedTextMessageData: { text: '👍' },
})

export const incomingHiddenPhone = incoming(
  { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет' } },
  { ...personalSender, senderContactName: '', senderPhoneNumber: 0 },
)

export const incomingGroupText = incoming(
  { typeMessage: 'textMessage', textMessageData: { textMessage: 'Сообщение в группе' } },
  {
    chatId: '-69876543210123',
    chatName: 'Группа',
    chatType: 'group',
    sender: CHAT_ID,
    senderName: SENDER_NAME,
    senderType: 'user',
    senderContactName: '',
    senderPhoneNumber: 0,
  },
)

export const outgoingApiEcho: MessageNotification = {
  ...incomingText,
  typeWebhook: 'outgoingAPIMessageReceived',
  idMessage: '115054445839974415',
}

export const outgoingFromPhone: MessageNotification = {
  ...incomingText,
  typeWebhook: 'outgoingMessageReceived',
}

export function outgoingStatus(status: string): OutgoingMessageStatusNotification {
  return {
    typeWebhook: 'outgoingMessageStatus',
    chatId: CHAT_ID,
    instanceData,
    timestamp: 1755591519,
    idMessage: '115054445839974415',
    status,
  }
}

export const stateChanged: StateInstanceChangedNotification = {
  typeWebhook: 'stateInstanceChanged',
  instanceData,
  timestamp: 1755589527,
  stateInstance: 'notAuthorized',
}

export const quotaExceeded: QuotaExceededNotification = {
  typeWebhook: 'quotaExceeded',
  instanceData,
  quotaData: {
    method: 'correspondents',
    used: 3,
    total: 3,
    status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
    description: 'Monthly quota exceeded. Only send/receive from: 10000000, 10000001, 10000002',
  },
}
