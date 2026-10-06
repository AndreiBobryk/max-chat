import { describe, expect, it } from 'vitest'
import {
  CHAT_ID,
  incomingAudio,
  incomingExtendedText,
  incomingGroupText,
  incomingHiddenPhone,
  incomingImage,
  incomingQuoted,
  incomingReaction,
  incomingSticker,
  incomingText,
  outgoingApiEcho,
  outgoingFromPhone,
  outgoingStatus,
  quotaExceeded,
  SENDER_NAME,
  SENDER_PHONE,
  stateChanged,
} from '../test/fixtures/notifications.ts'
import { parseNotification } from './notifications.ts'

const IGNORED = { type: 'ignored' }

describe('incoming text messages', () => {
  it('parses a plain text message', () => {
    expect(parseNotification(incomingText)).toEqual({
      type: 'incomingMessage',
      idMessage: '1763115112345',
      chatId: CHAT_ID,
      senderPhone: SENDER_PHONE,
      senderName: SENDER_NAME,
      timestamp: 1763115112000,
      kind: 'text',
      text: 'Привет',
    })
  })

  it.each([
    { name: 'a message with a link', body: incomingExtendedText, text: 'Документация на сайте https://green-api.com/' },
    { name: 'a reply with a quote', body: incomingQuoted, text: 'Цитируем это' },
  ])('takes the text of $name from extendedTextMessageData', ({ body, text }) => {
    expect(parseNotification(body)).toMatchObject({ type: 'incomingMessage', kind: 'text', text })
  })

  it('reports a hidden phone number as null and falls back to senderName', () => {
    expect(parseNotification(incomingHiddenPhone)).toMatchObject({
      type: 'incomingMessage',
      senderPhone: null,
      senderName: SENDER_NAME,
    })
  })

  it('accepts numeric ids', () => {
    const body = {
      ...incomingText,
      idMessage: 1763115112345,
      senderData: { ...incomingText.senderData, chatId: 10000000 },
    }

    expect(parseNotification(body)).toMatchObject({ idMessage: '1763115112345', chatId: '10000000' })
  })

  it('uses the current time when the timestamp is missing', () => {
    const { timestamp: _timestamp, ...body } = incomingText

    expect(parseNotification(body, 1_700_000_000_000)).toMatchObject({ timestamp: 1_700_000_000_000 })
  })
})

describe('incoming messages of other types', () => {
  it.each([
    { name: 'a sticker', body: incomingSticker },
    { name: 'an audio message', body: incomingAudio },
  ])('marks $name as unsupported', ({ body }) => {
    expect(parseNotification(body)).toMatchObject({
      type: 'incomingMessage',
      chatId: CHAT_ID,
      kind: 'unsupported',
      text: '',
    })
  })

  it('keeps the caption of an image it cannot show', () => {
    expect(parseNotification(incomingImage)).toMatchObject({
      type: 'incomingMessage',
      kind: 'unsupported',
      text: 'Подпись',
    })
  })

  it('has no text for an image without a caption', () => {
    const body = {
      ...incomingImage,
      messageData: { typeMessage: 'imageMessage', fileMessageData: { caption: '' } },
    }

    expect(parseNotification(body)).toMatchObject({ kind: 'unsupported', text: '' })
  })

  it('marks a text message without text as unsupported', () => {
    const body = { ...incomingText, messageData: { typeMessage: 'textMessage' } }

    expect(parseNotification(body)).toMatchObject({ type: 'incomingMessage', kind: 'unsupported' })
  })

  it('ignores a reaction', () => {
    expect(parseNotification(incomingReaction)).toEqual(IGNORED)
  })
})

describe('chats that are not personal', () => {
  it.each(['group', 'channel', 'bot'])('ignores a message from a %s', (chatType) => {
    const body = { ...incomingText, senderData: { ...incomingText.senderData, chatType } }

    expect(parseNotification(body)).toEqual(IGNORED)
  })

  it('ignores a group message', () => {
    expect(parseNotification(incomingGroupText)).toEqual(IGNORED)
  })

  it('treats a negative chatId as a group when chatType is missing', () => {
    const { chatType: _chatType, ...senderData } = incomingGroupText.senderData

    expect(parseNotification({ ...incomingGroupText, senderData })).toEqual(IGNORED)
  })
})

describe('outgoing notifications', () => {
  it('turns the echo of an API message into a binding event', () => {
    expect(parseNotification(outgoingApiEcho)).toEqual({
      type: 'outgoingEcho',
      idMessage: '115054445839974415',
      chatId: CHAT_ID,
    })
  })

  it('ignores a message sent from the phone', () => {
    expect(parseNotification(outgoingFromPhone)).toEqual(IGNORED)
  })

  it.each([
    { reported: 'sent', status: 'sent' },
    { reported: 'delivered', status: 'delivered' },
    { reported: 'read', status: 'read' },
    { reported: 'failed', status: 'failed' },
    { reported: 'notInGroup', status: 'failed' },
    { reported: 'noAccount', status: 'noAccount' },
    { reported: 'somethingNew', status: 'unknown' },
  ])('maps the "$reported" status to "$status"', ({ reported, status }) => {
    expect(parseNotification(outgoingStatus(reported))).toEqual({
      type: 'outgoingStatus',
      idMessage: '115054445839974415',
      chatId: CHAT_ID,
      status,
    })
  })
})

describe('service notifications', () => {
  it('parses an instance state change', () => {
    expect(parseNotification(stateChanged)).toEqual({ type: 'instanceState', state: 'notAuthorized' })
  })

  it('parses a quota notification', () => {
    expect(parseNotification(quotaExceeded)).toEqual({
      type: 'quotaExceeded',
      description: quotaExceeded.quotaData.description,
    })
  })
})

describe('unexpected input', () => {
  it.each([
    { name: 'null', body: null },
    { name: 'a string', body: 'incomingMessageReceived' },
    { name: 'a number', body: 42 },
    { name: 'an array', body: [incomingText] },
    { name: 'an empty object', body: {} },
    { name: 'an unknown typeWebhook', body: { typeWebhook: 'incomingCall' } },
    { name: 'a message without senderData', body: { typeWebhook: 'incomingMessageReceived' } },
    {
      name: 'a message with malformed parts',
      body: { ...incomingText, senderData: 'x', messageData: 7 },
    },
    { name: 'a message without idMessage', body: { ...incomingText, idMessage: undefined } },
    { name: 'a message without typeMessage', body: { ...incomingText, messageData: {} } },
    { name: 'a status without chatId', body: { ...outgoingStatus('read'), chatId: undefined } },
    { name: 'a state change without a state', body: { typeWebhook: 'stateInstanceChanged' } },
  ])('ignores $name without throwing', ({ body }) => {
    expect(parseNotification(body)).toEqual(IGNORED)
  })
})
