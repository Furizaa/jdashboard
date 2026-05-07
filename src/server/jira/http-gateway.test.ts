import { describe, expect, it } from 'vitest'
import { createHttpJiraGateway } from './http-gateway'

type FetchArgs = { url: string; init: RequestInit }

function makeFetchSpy(response: Response): {
  fetchFn: typeof fetch
  calls: FetchArgs[]
} {
  const calls: FetchArgs[] = []
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({
      url: typeof input === 'string' ? input : (input as URL).toString(),
      init: init as RequestInit,
    })
    return Promise.resolve(response)
  }
  return { fetchFn, calls }
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('createHttpJiraGateway — auth header', () => {
  it('sends Basic auth derived from email and apiToken', async () => {
    const { fetchFn, calls } = makeFetchSpy(
      jsonResponse({ accountId: 'a', displayName: 'd', avatarUrls: {} }),
    )
    const gateway = createHttpJiraGateway({
      baseUrl: 'https://x.example',
      email: 'user@example.com',
      apiToken: 'tok',
      fetch: fetchFn,
    })
    await gateway.getMyself()
    const expected = `Basic ${Buffer.from('user@example.com:tok', 'utf8').toString('base64')}`
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers.Authorization).toBe(expected)
  })
})

describe('createHttpJiraGateway — error mapping', () => {
  it('maps a 401 response to { ok: false, reason: "unauthorized" }', async () => {
    const { fetchFn } = makeFetchSpy(new Response('nope', { status: 401 }))
    const gateway = createHttpJiraGateway({
      baseUrl: 'https://x.example',
      email: 'u',
      apiToken: 't',
      fetch: fetchFn,
    })
    const result = await gateway.getMyself()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('maps a 404 response to { ok: false, reason: "not-found" }', async () => {
    const { fetchFn } = makeFetchSpy(new Response('missing', { status: 404 }))
    const gateway = createHttpJiraGateway({
      baseUrl: 'https://x.example',
      email: 'u',
      apiToken: 't',
      fetch: fetchFn,
    })
    const result = await gateway.getIssue('HDR-NOPE', ['summary'])
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  it('maps a 400 response to { ok: false, reason: "rejected" } with parsed message', async () => {
    const { fetchFn } = makeFetchSpy(
      new Response(JSON.stringify({ errorMessages: ['Bad input'] }), { status: 400 }),
    )
    const gateway = createHttpJiraGateway({
      baseUrl: 'https://x.example',
      email: 'u',
      apiToken: 't',
      fetch: fetchFn,
    })
    const result = await gateway.transitionIssue('HDR-1', '21')
    expect(result).toEqual({ ok: false, reason: 'rejected', message: 'Bad input' })
  })

  it('falls back to raw body when error JSON is malformed', async () => {
    const { fetchFn } = makeFetchSpy(new Response('not-json', { status: 500 }))
    const gateway = createHttpJiraGateway({
      baseUrl: 'https://x.example',
      email: 'u',
      apiToken: 't',
      fetch: fetchFn,
    })
    const result = await gateway.transitionIssue('HDR-1', '21')
    expect(result).toEqual({ ok: false, reason: 'rejected', message: 'not-json' })
  })
})
