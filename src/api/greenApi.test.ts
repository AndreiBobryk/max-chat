import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server.ts'
import { GreenApiError, isAbortError } from './errors.ts'
import { apiUrlCandidates, createGreenApiClient, FALLBACK_API_URL } from './greenApi.ts'

const API_URL = 'https://3100.api.green-api.com'
const ID_INSTANCE = '3100000001'
const TOKEN = 'd75b3a66374942c5b3c019c698abc2067e151558acbd412345'
const BASE = `${API_URL}/waInstance${ID_INSTANCE}`

const client = createGreenApiClient({
  apiUrl: API_URL,
  idInstance: ID_INSTANCE,
  apiTokenInstance: TOKEN,
})

function respondWith(resolver: () => Response | Promise<Response>) {
  const requests: Request[] = []
  server.use(
    http.all(`${API_URL}/*`, ({ request }) => {
      requests.push(request.clone())
      return resolver()
    }),
  )
  return requests
}

async function neverRespond(): Promise<Response> {
  await delay('infinite')
  return HttpResponse.json(null)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendMessage', () => {
  it('posts chatId and message as JSON and returns idMessage', async () => {
    const requests = respondWith(() => HttpResponse.json({ idMessage: '1763115112345' }))

    const result = await client.sendMessage('79991234567@c.us', 'Привет')

    expect(result).toEqual({ idMessage: '1763115112345' })
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('POST')
    expect(requests[0].url).toBe(`${BASE}/sendMessage/${TOKEN}`)
    expect(requests[0].headers.get('content-type')).toBe('application/json')
    expect(await requests[0].json()).toEqual({ chatId: '79991234567@c.us', message: 'Привет' })
  })

  it('rejects a successful response without idMessage', async () => {
    respondWith(() => HttpResponse.json({}))

    await expect(client.sendMessage('10000000', 'hi')).rejects.toMatchObject({
      name: 'GreenApiError',
      kind: 'unknown',
    })
  })
})

describe('receiveNotification', () => {
  it('sends GET with the receiveTimeout parameter', async () => {
    const requests = respondWith(() => HttpResponse.json(null))

    await client.receiveNotification({ receiveTimeout: 25 })

    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('GET')
    expect(requests[0].url).toBe(`${BASE}/receiveNotification/${TOKEN}?receiveTimeout=25`)
  })

  it('returns null when the body is empty', async () => {
    respondWith(() => new HttpResponse(null, { status: 200 }))

    expect(await client.receiveNotification()).toBeNull()
  })

  it('returns null when the body is JSON null', async () => {
    respondWith(() => HttpResponse.json(null))

    expect(await client.receiveNotification()).toBeNull()
  })

  it('returns receiptId and the notification body', async () => {
    const body = { typeWebhook: 'incomingMessageReceived', idMessage: '1763115112345' }
    respondWith(() => HttpResponse.json({ receiptId: 1234567, body }))

    expect(await client.receiveNotification()).toEqual({ receiptId: 1234567, body })
  })

  it.each([
    { requested: 1, sent: 5 },
    { requested: 120, sent: 60 },
    { requested: undefined, sent: 5 },
  ])('clamps receiveTimeout $requested to $sent', async ({ requested, sent }) => {
    const requests = respondWith(() => HttpResponse.json(null))

    await client.receiveNotification({ receiveTimeout: requested })

    expect(new URL(requests[0].url).searchParams.get('receiveTimeout')).toBe(String(sent))
  })

  it('waits 10 seconds longer than the long poll before giving up', async () => {
    respondWith(() => HttpResponse.json(null))
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await client.receiveNotification({ receiveTimeout: 25 })

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 35_000)
  })

  it('rejects a successful response without receiptId', async () => {
    respondWith(() => HttpResponse.json({ body: {} }))

    await expect(client.receiveNotification()).rejects.toMatchObject({
      name: 'GreenApiError',
      kind: 'unknown',
    })
  })
})

describe('deleteNotification', () => {
  it('sends DELETE with receiptId in the path and returns the result', async () => {
    const requests = respondWith(() => HttpResponse.json({ result: true, reason: '' }))

    expect(await client.deleteNotification(1234567)).toBe(true)
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('DELETE')
    expect(requests[0].url).toBe(`${BASE}/deleteNotification/${TOKEN}/1234567`)
  })

  it('returns false when the notification was not deleted', async () => {
    respondWith(() => HttpResponse.json({ result: false, reason: 'already deleted' }))

    expect(await client.deleteNotification(1234567)).toBe(false)
  })
})

describe('request URL', () => {
  it('escapes apiTokenInstance', async () => {
    const requests = respondWith(() => HttpResponse.json(null))
    const oddClient = createGreenApiClient({
      apiUrl: API_URL,
      idInstance: ID_INSTANCE,
      apiTokenInstance: 'a/b c?',
    })

    await oddClient.receiveNotification()

    expect(requests[0].url).toBe(`${BASE}/receiveNotification/a%2Fb%20c%3F?receiveTimeout=5`)
  })
})

describe('error responses', () => {
  const quotaDescription =
    'Monthly quota has been exceeded. Please go to your console and change the tariff to business'

  it.each([
    {
      name: '400 with a JSON message',
      status: 400,
      body: JSON.stringify({ statusCode: 400, message: 'Validation failed' }),
      kind: 'badRequest',
      serverText: 'Validation failed',
    },
    {
      name: '400 with plain text',
      status: 400,
      body: 'instance is starting or not authorized',
      kind: 'badRequest',
      serverText: 'instance is starting or not authorized',
    },
    { name: '401 with an empty body', status: 401, body: '', kind: 'unauthorized', serverText: '' },
    { name: '403 with an empty body', status: 403, body: '', kind: 'forbidden', serverText: '' },
    {
      name: '404 with an nginx page',
      status: 404,
      body: '<html>\r\n<head><title>404 Not Found</title></head>\r\n<body></body>\r\n</html>',
      kind: 'notFound',
      serverText: '',
    },
    { name: '429 with an empty body', status: 429, body: '', kind: 'rateLimit', serverText: '' },
    {
      name: '466 for the chat quota',
      status: 466,
      body: JSON.stringify({
        quotaData: {
          method: 'correspondents',
          used: '3',
          total: '3',
          status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
          description: quotaDescription,
        },
      }),
      kind: 'quota',
      serverText: quotaDescription,
    },
    {
      name: '466 for a method quota',
      status: 466,
      body: JSON.stringify({
        invokeStatus: {
          method: 'checkAccount',
          used: '100',
          total: '100',
          status: 'QUOTE_EXCEEDED',
          description: quotaDescription,
        },
      }),
      kind: 'quota',
      serverText: quotaDescription,
    },
    {
      name: '500 with a JSON message',
      status: 500,
      body: JSON.stringify({ message: 'request entity too large' }),
      kind: 'server',
      serverText: 'request entity too large',
    },
    {
      name: '502 with an nginx page',
      status: 502,
      body: '<html><head><title>502 Bad Gateway</title></head></html>',
      kind: 'server',
      serverText: '',
    },
  ])('maps $name', async ({ status, body, kind, serverText }) => {
    respondWith(() => new HttpResponse(body, { status }))

    await expect(client.sendMessage('10000000', 'hi')).rejects.toMatchObject({
      name: 'GreenApiError',
      kind,
      status,
      serverText,
    })
  })

  it('keeps the token out of the error message', async () => {
    respondWith(() => new HttpResponse(null, { status: 401 }))

    const error = await client.receiveNotification().catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(GreenApiError)
    expect(String(error)).not.toContain(TOKEN)
  })
})

describe('transport failures', () => {
  it('reports a network failure', async () => {
    respondWith(() => HttpResponse.error())

    await expect(client.sendMessage('10000000', 'hi')).rejects.toMatchObject({
      name: 'GreenApiError',
      kind: 'network',
      status: undefined,
    })
  })

  it('reports a timeout when the server does not answer in time', async () => {
    respondWith(neverRespond)
    const impatientClient = createGreenApiClient({
      apiUrl: API_URL,
      idInstance: ID_INSTANCE,
      apiTokenInstance: TOKEN,
      requestTimeoutMs: 30,
    })

    await expect(impatientClient.sendMessage('10000000', 'hi')).rejects.toMatchObject({
      name: 'GreenApiError',
      kind: 'timeout',
    })
  })

  it('passes cancellation through as an abort, not as a network failure', async () => {
    const requests = respondWith(neverRespond)
    const controller = new AbortController()

    const pending = client
      .receiveNotification({ receiveTimeout: 25, signal: controller.signal })
      .catch((reason: unknown) => reason)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    controller.abort()
    const error = await pending

    expect(isAbortError(error)).toBe(true)
    expect(error).not.toBeInstanceOf(GreenApiError)
  })

  it('does not send a request when the signal is already aborted', async () => {
    const requests = respondWith(() => HttpResponse.json(null))
    const controller = new AbortController()
    controller.abort()

    const error = await client
      .receiveNotification({ signal: controller.signal })
      .catch((reason: unknown) => reason)

    expect(isAbortError(error)).toBe(true)
    expect(requests).toHaveLength(0)
  })
})

describe('apiUrlCandidates', () => {
  it('derives the instance host from idInstance and falls back to the generic host', () => {
    expect(apiUrlCandidates('3100000001')).toEqual([
      'https://3100.api.green-api.com',
      FALLBACK_API_URL,
    ])
  })

  it('uses only the override when it is set', () => {
    expect(apiUrlCandidates('3100000001', 'https://example.test/')).toEqual([
      'https://example.test',
    ])
  })

  it('uses only the generic host when idInstance cannot give a host', () => {
    expect(apiUrlCandidates('31')).toEqual([FALLBACK_API_URL])
  })
})
