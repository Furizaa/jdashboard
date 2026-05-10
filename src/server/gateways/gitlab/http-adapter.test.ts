import { HttpClient, HttpClientError, HttpClientResponse } from '@effect/platform'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ServerEnv, type ServerEnvShape } from '../../runtime/server-env'
import { GitlabGatewayLive } from './http-adapter'
import { GitlabGateway } from './port'

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
  GITLAB_TOKEN: 'glpat-secret',
  GITLAB_PROJECT_PATH: 'group/sub/project',
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
  program: Effect.Effect<A, E, GitlabGateway>,
  client: HttpClient.HttpClient,
): Effect.Effect<A, E, never> {
  const HttpClientTest = Layer.succeed(HttpClient.HttpClient, client)
  const GitlabGatewayTest = GitlabGatewayLive.pipe(
    Layer.provide(Layer.mergeAll(ServerEnvTest, HttpClientTest)),
  )
  return program.pipe(Effect.provide(GitlabGatewayTest))
}

describe('GitlabGatewayLive — auth header', () => {
  it.effect('sends the PRIVATE-TOKEN header from env on getCurrentUser', () => {
    const captured: Capture[] = []
    const client = fakeHttpClient(() => jsonResponse({ username: 'u', name: 'n' }), captured)
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      yield* gateway.getCurrentUser()
    })
    return provideTestLayers(program, client).pipe(
      Effect.tap(() => {
        const headers = captured[0]?.headers ?? {}
        expect(headers['private-token'] ?? headers['PRIVATE-TOKEN']).toBe('glpat-secret')
      }),
    )
  })
})

describe('GitlabGatewayLive — project path encoding', () => {
  it.effect('URL-encodes the project path on getMr', () => {
    const captured: Capture[] = []
    const client = fakeHttpClient(
      () =>
        jsonResponse({
          iid: 42,
          title: 'HDR-42',
          web_url: 'x',
          state: 'opened',
          draft: false,
          updated_at: '2026-05-01T00:00:00Z',
          reviewers: [],
          head_pipeline: null,
          has_conflicts: false,
        }),
      captured,
    )
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      yield* gateway.getMr(42)
    })
    return provideTestLayers(program, client).pipe(
      Effect.tap(() => {
        expect(captured[0]?.url).toBe(
          'https://gitlab.example/api/v4/projects/group%2Fsub%2Fproject/merge_requests/42',
        )
      }),
    )
  })
})

describe('GitlabGatewayLive — error mapping', () => {
  it.effect('maps a 401 response to Unauthorized', () => {
    const client = fakeHttpClient(() => new Response('nope', { status: 401 }))
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const result = yield* gateway.getCurrentUser().pipe(Effect.flip)
      expect(result._tag).toBe('Unauthorized')
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a 404 response on getMr to NotFound', () => {
    const client = fakeHttpClient(() => new Response('missing', { status: 404 }))
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const result = yield* gateway.getMr(999).pipe(Effect.flip)
      expect(result._tag).toBe('NotFound')
    })
    return provideTestLayers(program, client)
  })

  it.effect('maps a 400 with JSON message to Rejected', () => {
    const client = fakeHttpClient(
      () =>
        new Response(JSON.stringify({ message: 'Bad input' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const result = yield* gateway.getMr(1).pipe(Effect.flip)
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
      const gateway = yield* GitlabGateway
      const result = yield* gateway.getMr(1).pipe(Effect.flip)
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
      const gateway = yield* GitlabGateway
      const result = yield* gateway.getCurrentUser().pipe(Effect.flip)
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
      const gateway = yield* GitlabGateway
      const result = yield* gateway.getCurrentUser().pipe(Effect.flip)
      expect(result._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })
})

describe('GitlabGatewayLive — wire shape normalisation', () => {
  it.effect('normalises snake_case wire fields into camelCase Raw* shapes for getMr', () => {
    const client = fakeHttpClient(() =>
      jsonResponse({
        iid: 7,
        title: 'HDR-7',
        web_url: 'https://gitlab/p/-/merge_requests/7',
        state: 'opened',
        draft: false,
        updated_at: '2026-05-01T00:00:00Z',
        reviewers: [{ username: 'alice', name: 'Alice', avatar_url: 'https://avatars/a' }],
        head_pipeline: { status: 'success' },
        has_conflicts: false,
      }),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const value = yield* gateway.getMr(7)
      expect(value).toEqual({
        iid: 7,
        title: 'HDR-7',
        webUrl: 'https://gitlab/p/-/merge_requests/7',
        state: 'opened',
        draft: false,
        updatedAt: '2026-05-01T00:00:00Z',
        reviewers: [{ username: 'alice', displayName: 'Alice', avatarUrl: 'https://avatars/a' }],
        headPipelineStatus: 'success',
        hasConflicts: false,
      })
    })
    return provideTestLayers(program, client)
  })

  it.effect('normalises approved_by[].user.username into approvedUsernames', () => {
    const client = fakeHttpClient(() =>
      jsonResponse({
        approved_by: [{ user: { username: 'alice' } }, { user: { username: 'bob' } }],
      }),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const value = yield* gateway.getMrApprovals(1)
      expect(Array.from(value.approvedUsernames)).toEqual(['alice', 'bob'])
    })
    return provideTestLayers(program, client)
  })

  it.effect('normalises the nested user shape from /merge_requests/:iid/reviewers', () => {
    const client = fakeHttpClient(() =>
      jsonResponse([
        {
          user: { username: 'alice', name: 'Alice', avatar_url: 'https://avatars/a' },
          state: 'unreviewed',
        },
        { user: { username: 'bob', name: 'Bob' }, state: 'approved' },
      ]),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const value = yield* gateway.getMrReviewers(1)
      expect(value).toEqual([
        {
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: 'https://avatars/a',
          state: 'unreviewed',
        },
        { username: 'bob', displayName: 'Bob', avatarUrl: null, state: 'approved' },
      ])
    })
    return provideTestLayers(program, client)
  })
})

describe('GitlabGatewayLive — getMrDiscussions tolerates missing `resolved`', () => {
  // GitLab omits `resolved` on non-resolvable notes (system notes, plain
  // comments). The schema must default the missing field to `false` so the
  // whole MR fan-out doesn't drop on every real-world MR.
  it.effect('decodes a system note without `resolved` field', () => {
    const client = fakeHttpClient(() =>
      jsonResponse([
        {
          id: 'd1',
          notes: [
            {
              author: { username: 'system-bot' },
              resolvable: false,
              system: true,
            },
          ],
        },
      ]),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const value = yield* gateway.getMrDiscussions(1)
      expect(value).toEqual([
        {
          id: 'd1',
          notes: [
            { authorUsername: 'system-bot', resolvable: false, resolved: false, system: true },
          ],
        },
      ])
    })
    return provideTestLayers(program, client)
  })
})

describe('GitlabGatewayLive — schema decode failures route to TransportError', () => {
  it.effect('getCurrentUser: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse({ wrong: 'shape' }))
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const failure = yield* gateway.getCurrentUser().pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('listMrs: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse([{ wrong: 'shape' }]))
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const failure = yield* gateway
        .listMrs({
          states: ['opened'],
          reviewerUsername: 'me',
          updatedAfter: new Date('2026-05-01T00:00:00Z'),
        })
        .pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('listMrs: unknown state literal decodes as TransportError', () => {
    const client = fakeHttpClient(() =>
      jsonResponse([
        {
          iid: 1,
          title: 't',
          web_url: 'u',
          state: 'reopened',
          draft: false,
          updated_at: '2026-05-01T00:00:00Z',
        },
      ]),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const failure = yield* gateway
        .listMrs({
          states: ['opened'],
          reviewerUsername: 'me',
          updatedAfter: new Date('2026-05-01T00:00:00Z'),
        })
        .pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('getMr: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse({ wrong: 'shape' }))
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const failure = yield* gateway.getMr(1).pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('getMrDiscussions: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse([{ wrong: 'shape' }]))
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const failure = yield* gateway.getMrDiscussions(1).pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('getMrApprovals: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse({ wrong: 'shape' }))
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const failure = yield* gateway.getMrApprovals(1).pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('getMrReviewers: wrong-shape body decodes as TransportError', () => {
    const client = fakeHttpClient(() => jsonResponse([{ wrong: 'shape' }]))
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const failure = yield* gateway.getMrReviewers(1).pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })

  it.effect('getMrReviewers: unknown reviewer state decodes as TransportError', () => {
    const client = fakeHttpClient(() =>
      jsonResponse([{ user: { username: 'a', name: 'A' }, state: 'pending' }]),
    )
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      const failure = yield* gateway.getMrReviewers(1).pipe(Effect.flip)
      expect(failure._tag).toBe('TransportError')
    })
    return provideTestLayers(program, client)
  })
})

describe('GitlabGatewayLive — listMrs', () => {
  it.effect('builds query strings per state and includes reviewer/author param', () => {
    const captured: Capture[] = []
    const client = fakeHttpClient(() => jsonResponse([]), captured)
    const program = Effect.gen(function* () {
      const gateway = yield* GitlabGateway
      yield* gateway.listMrs({
        states: ['opened', 'merged'],
        reviewerUsername: 'me',
        updatedAfter: new Date('2026-05-01T00:00:00Z'),
      })
    })
    return provideTestLayers(program, client).pipe(
      Effect.tap(() => {
        expect(captured).toHaveLength(2)
        const urls = captured.map((c) => c.url)
        expect(urls[0]).toContain('state=opened')
        expect(urls[0]).toContain('reviewer_username=me')
        expect(urls[0]).toContain('updated_after=2026-05-01T00')
        expect(urls[1]).toContain('state=merged')
      }),
    )
  })
})
