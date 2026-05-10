import { HttpClient, HttpClientError, HttpClientResponse } from '@effect/platform'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ServerEnv, type ServerEnvShape } from '../../runtime/server-env'
import { JiraGatewayLive } from './http-adapter'
import { JiraGateway } from './port'

type Capture = { url: string; method: string; headers: Record<string, string>; body?: string }

function fakeHttpClient(
  respond: (request: { url: string; method: string }) => Response,
  captured: Capture[] = [],
): HttpClient.HttpClient {
  return HttpClient.make((request, url) =>
    Effect.sync(() => {
      const headers = { ...request.headers } as Record<string, string>
      const body =
        request.body._tag === 'Uint8Array' ? new TextDecoder().decode(request.body.body) : undefined
      captured.push({ url: url.toString(), method: request.method, headers, body })
      const response = respond({ url: url.toString(), method: request.method })
      return HttpClientResponse.fromWeb(request, response)
    }),
  )
}

const baseEnv: ServerEnvShape = {
  JIRA_BASE_URL: 'https://x.example',
  JIRA_EMAIL: 'user@example.com',
  JIRA_API_TOKEN: 'tok',
  JIRA_PROJECT_KEY: 'HDR',
  JIRA_LABEL_FILTER: 'Frontend',
  JIRA_DONE_WINDOW_DAYS: 14,
  JIRA_HIDE_LABELS: [],
  GITLAB_BASE_URL: 'https://gitlab.example',
  GITLAB_TOKEN: 'g',
  GITLAB_PROJECT_PATH: 'group/project',
}

const ServerEnvTest = Layer.succeed(ServerEnv, baseEnv)

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function provideTestLayers<A, E>(
  program: Effect.Effect<A, E, JiraGateway>,
  client: HttpClient.HttpClient,
): Effect.Effect<A, E, never> {
  const HttpClientTest = Layer.succeed(HttpClient.HttpClient, client)
  const JiraGatewayTest = JiraGatewayLive.pipe(
    Layer.provide(Layer.mergeAll(ServerEnvTest, HttpClientTest)),
  )
  return program.pipe(Effect.provide(JiraGatewayTest))
}

describe('JiraGatewayLive — auth header', () => {
  it.effect('sends Basic auth derived from email and apiToken on getMyself', () => {
    const captured: Capture[] = []
    const client = fakeHttpClient(
      () => jsonResponse({ accountId: 'a', displayName: 'd', avatarUrls: {} }),
      captured,
    )
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      yield* gateway.getMyself()
    })
    return provideTestLayers(program, client).pipe(
      Effect.tap(() => {
        const expected = `Basic ${Buffer.from('user@example.com:tok', 'utf8').toString('base64')}`
        expect(captured[0]?.headers.authorization ?? captured[0]?.headers.Authorization).toBe(
          expected,
        )
      }),
    )
  })
})

describe('JiraGatewayLive — error mapping', () => {
  it.effect('maps a 401 response to Unauthorized', () => {
    const client = fakeHttpClient(() => new Response('nope', { status: 401 }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const exit = yield* Effect.exit(gateway.getMyself())
      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure') {
        const failure = exit.cause
        // The cause carries the Unauthorized tagged error.
        expect(JSON.stringify(failure)).toContain('Unauthorized')
      }
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a 404 response to NotFound on getIssue', () => {
    const client = fakeHttpClient(() => new Response('missing', { status: 404 }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const result = yield* gateway.getIssue('HDR-NOPE', ['summary']).pipe(Effect.flip)
      expect(result._tag).toBe('NotFound')
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a 400 response to Rejected with parsed message', () => {
    const client = fakeHttpClient(
      () =>
        new Response(JSON.stringify({ errorMessages: ['Bad input'] }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const result = yield* gateway.transitionIssue('HDR-1', '21').pipe(Effect.flip)
      expect(result._tag).toBe('Rejected')
      if (result._tag === 'Rejected') {
        expect(result.message).toBe('Bad input')
      }
    })
    return provideTestLayers(program, client)
  })

  it.effect('falls back to raw body when error JSON is malformed', () => {
    const client = fakeHttpClient(() => new Response('not-json', { status: 500 }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const result = yield* gateway.transitionIssue('HDR-1', '21').pipe(Effect.flip)
      expect(result._tag).toBe('Rejected')
      if (result._tag === 'Rejected') {
        expect(result.message).toBe('not-json')
      }
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a network failure (HttpClient transport error) to TransportError', () => {
    const client = HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.RequestError({
          request,
          reason: 'Transport',
          description: 'connection refused',
        }),
      ),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const result = yield* gateway.getMyself().pipe(Effect.flip)
      expect(result._tag).toBe('TransportError')
      if (result._tag === 'TransportError') {
        expect(result.message).toContain('connection refused')
      }
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a malformed-JSON 2xx response to TransportError (decode failure)', () => {
    const client = fakeHttpClient(
      () =>
        new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const result = yield* gateway.getMyself().pipe(Effect.flip)
      expect(result._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })
})

describe('JiraGatewayLive — streamMedia', () => {
  it.effect(
    'GETs /rest/api/3/attachment/content/<id>?redirect=false and returns the stream + mimeType + length',
    () => {
      const captured: Capture[] = []
      const binaryBytes = new Uint8Array([1, 2, 3, 4])
      const client = fakeHttpClient(
        () =>
          new Response(binaryBytes, {
            status: 200,
            headers: {
              'content-type': 'image/png',
              'content-length': '4',
            },
          }),
        captured,
      )

      const program = Effect.gen(function* () {
        const gateway = yield* JiraGateway
        const media = yield* gateway.streamMedia('media-1')
        expect(media.mimeType).toBe('image/png')
        expect(media.contentLength).toBe(4)
        expect(captured).toHaveLength(1)
        expect(captured[0]?.method).toBe('GET')
        expect(captured[0]?.url).toBe(
          'https://x.example/rest/api/3/attachment/content/media-1?redirect=false',
        )
        const expected = `Basic ${Buffer.from('user@example.com:tok', 'utf8').toString('base64')}`
        expect(captured[0]?.headers.authorization ?? captured[0]?.headers.Authorization).toBe(
          expected,
        )
      })
      return provideTestLayers(program, client)
    },
  )

  it.effect('maps a 404 from the content endpoint to MediaNotFound', () => {
    const client = fakeHttpClient(() => new Response('gone', { status: 404 }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway.streamMedia('media-1').pipe(Effect.flip)
      expect(failure._tag).toBe('MediaNotFound')
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a 401 from the content endpoint to MediaResolutionError', () => {
    const client = fakeHttpClient(() => new Response('nope', { status: 401 }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway.streamMedia('media-1').pipe(Effect.flip)
      expect(failure._tag).toBe('MediaResolutionError')
      if (failure._tag === 'MediaResolutionError') {
        expect(failure.status).toBe(401)
      }
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a 403 from the content endpoint to MediaResolutionError', () => {
    const client = fakeHttpClient(() => new Response('forbidden', { status: 403 }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway.streamMedia('media-1').pipe(Effect.flip)
      expect(failure._tag).toBe('MediaResolutionError')
      if (failure._tag === 'MediaResolutionError') {
        expect(failure.status).toBe(403)
      }
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a 502 from the content endpoint to MediaResolutionError', () => {
    const client = fakeHttpClient(() => new Response('bad gateway', { status: 502 }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway.streamMedia('media-1').pipe(Effect.flip)
      expect(failure._tag).toBe('MediaResolutionError')
      if (failure._tag === 'MediaResolutionError') {
        expect(failure.status).toBe(502)
      }
    })
    return provideTestLayers(program, client)
  })
})

describe('JiraGatewayLive — searchIssues', () => {
  it.effect('decodes the response body into RawSearchResponse', () => {
    const client = fakeHttpClient(() => jsonResponse({ issues: [] }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const result = yield* gateway.searchIssues('project = HDR', ['summary'])
      expect(result).toEqual({ issues: [] })
    })
    return provideTestLayers(program, client)
  })

  it.effect('sends the JQL and fields in the POST body', () => {
    const captured: Capture[] = []
    const client = fakeHttpClient(() => jsonResponse({ issues: [] }), captured)
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      yield* gateway.searchIssues('project = HDR', ['summary', 'status'])
    })
    return provideTestLayers(program, client).pipe(
      Effect.tap(() => {
        expect(captured[0]?.method).toBe('POST')
        expect(captured[0]?.body).toBeDefined()
        const body = JSON.parse(captured[0]!.body!) as {
          jql: string
          fields: string[]
          maxResults: number
        }
        expect(body.jql).toBe('project = HDR')
        expect(body.fields).toEqual(['summary', 'status'])
        expect(body.maxResults).toBe(100)
      }),
    )
  })
})

describe('JiraGatewayLive — schema decode failures route to TransportError', () => {
  it.effect('getMyself: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse({ wrong: 'shape' }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway.getMyself().pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('searchIssues: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse({ wrong: 'shape' }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway.searchIssues('project = HDR', ['summary']).pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('getIssue: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse({ wrong: 'shape' }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway.getIssue('HDR-1', ['summary']).pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('getTransitions: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse({ wrong: 'shape' }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway.getTransitions('HDR-1').pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('createIssue: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse({ wrong: 'shape' }))
    const program = Effect.gen(function* () {
      const gateway = yield* JiraGateway
      const failure = yield* gateway
        .createIssue({
          fields: {
            project: { key: 'HDR' },
            issuetype: { name: 'Bug' },
            summary: 's',
            description: { type: 'doc', version: 1, content: [] },
            priority: { name: 'Lowest' },
            labels: [],
            parent: { key: 'HDR-1' },
            assignee: { accountId: 'a' },
          },
        })
        .pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })
})
