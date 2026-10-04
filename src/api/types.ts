export type SendMessageResult = {
  idMessage: string
}

export type ReceivedNotification = {
  receiptId: number
  // Untrusted payload: shapes below describe what the API documents, not what is guaranteed.
  body: unknown
}

export type InstanceData = {
  idInstance: number
  wid: string
  typeInstance: string
}

export type SenderData = {
  chatId: string
  chatName?: string
  chatType?: string
  sender?: string
  senderName?: string
  senderType?: string
  senderContactName?: string
  // 0 when the sender hides the phone number.
  senderPhoneNumber?: number
}

export type MessageData = {
  typeMessage: string
  textMessageData?: { textMessage: string }
  // Carries the text of both extendedTextMessage and quotedMessage.
  extendedTextMessageData?: {
    text: string
    description?: string
    title?: string
    jpegThumbnail?: string
    isForwarded?: boolean
    forwardingScore?: number
    // Set on quotedMessage: the id of the quoted message and its chat.
    stanzaId?: string
    participant?: string
  }
  // Non-text types bring their own payload, e.g. fileMessageData.
  [field: string]: unknown
}

export type MessageNotification = {
  typeWebhook: 'incomingMessageReceived' | 'outgoingMessageReceived' | 'outgoingAPIMessageReceived'
  instanceData: InstanceData
  timestamp: number
  idMessage: string
  senderData: SenderData
  messageData: MessageData
}

export type OutgoingMessageStatusNotification = {
  typeWebhook: 'outgoingMessageStatus'
  instanceData: InstanceData
  timestamp: number
  chatId: string
  idMessage: string
  status: string
  description?: string
}

export type StateInstanceChangedNotification = {
  typeWebhook: 'stateInstanceChanged'
  instanceData: InstanceData
  timestamp: number
  stateInstance: string
}

export type QuotaExceededNotification = {
  typeWebhook: 'quotaExceeded'
  instanceData: InstanceData
  timestamp?: number
  quotaData: {
    method: string
    used: number | string
    total: number | string
    status: string
    description: string
  }
}

export type NotificationBody =
  | MessageNotification
  | OutgoingMessageStatusNotification
  | StateInstanceChangedNotification
  | QuotaExceededNotification
