import { describe, expect, it } from 'vitest'
import { createHttpGitlabGateway } from './http-gateway'

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

describe('createHttpGitlabGateway — auth header', () => {
  it('sends the PRIVATE-TOKEN header from config', async () => {
    const { fetchFn, calls } = makeFetchSpy(jsonResponse({ username: 'u', name: 'n' }))
    const gateway = createHttpGitlabGateway({
      baseUrl: 'https://gitlab.example',
      token: 'glpat-secret',
      projectPath: 'group/project',
      fetch: fetchFn,
    })
    await gateway.getCurrentUser()
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers['PRIVATE-TOKEN']).toBe('glpat-secret')
  })
})

describe('createHttpGitlabGateway — project path encoding', () => {
  it('URL-encodes the project path in the request URL', async () => {
    const { fetchFn, calls } = makeFetchSpy(
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
    )
    const gateway = createHttpGitlabGateway({
      baseUrl: 'https://gitlab.example',
      token: 't',
      projectPath: 'group/sub/project',
      fetch: fetchFn,
    })
    await gateway.getMr(42)
    expect(calls[0]?.url).toBe(
      'https://gitlab.example/api/v4/projects/group%2Fsub%2Fproject/merge_requests/42',
    )
  })
})

describe('createHttpGitlabGateway — error mapping', () => {
  it('maps a 401 response to { ok: false, reason: "unauthorized" }', async () => {
    const { fetchFn } = makeFetchSpy(new Response('nope', { status: 401 }))
    const gateway = createHttpGitlabGateway({
      baseUrl: 'https://gitlab.example',
      token: 't',
      projectPath: 'g/p',
      fetch: fetchFn,
    })
    const result = await gateway.getCurrentUser()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('maps a 404 response to { ok: false, reason: "not-found" }', async () => {
    const { fetchFn } = makeFetchSpy(new Response('missing', { status: 404 }))
    const gateway = createHttpGitlabGateway({
      baseUrl: 'https://gitlab.example',
      token: 't',
      projectPath: 'g/p',
      fetch: fetchFn,
    })
    const result = await gateway.getMr(999)
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  it('maps a 400 response to { ok: false, reason: "rejected" } with the GitLab message', async () => {
    const { fetchFn } = makeFetchSpy(
      new Response(JSON.stringify({ message: 'Bad input' }), { status: 400 }),
    )
    const gateway = createHttpGitlabGateway({
      baseUrl: 'https://gitlab.example',
      token: 't',
      projectPath: 'g/p',
      fetch: fetchFn,
    })
    const result = await gateway.getMr(1)
    expect(result).toEqual({ ok: false, reason: 'rejected', message: 'Bad input' })
  })
})

describe('createHttpGitlabGateway — wire shape normalisation', () => {
  it('normalises snake_case wire fields into camelCase Raw* shapes for getMr', async () => {
    const { fetchFn } = makeFetchSpy(
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
    const gateway = createHttpGitlabGateway({
      baseUrl: 'https://gitlab.example',
      token: 't',
      projectPath: 'g/p',
      fetch: fetchFn,
    })
    const result = await gateway.getMr(7)
    if (!result.ok) throw new Error('expected ok')
    expect(result.value).toEqual({
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

  it('normalises approved_by[].user.username into approvedUsernames', async () => {
    const { fetchFn } = makeFetchSpy(
      jsonResponse({
        approved_by: [{ user: { username: 'alice' } }, { user: { username: 'bob' } }],
      }),
    )
    const gateway = createHttpGitlabGateway({
      baseUrl: 'https://gitlab.example',
      token: 't',
      projectPath: 'g/p',
      fetch: fetchFn,
    })
    const result = await gateway.getMrApprovals(1)
    if (!result.ok) throw new Error('expected ok')
    expect(Array.from(result.value.approvedUsernames)).toEqual(['alice', 'bob'])
  })

  it('normalises the nested user shape returned by /merge_requests/:iid/reviewers', async () => {
    const { fetchFn } = makeFetchSpy(
      jsonResponse([
        {
          user: { username: 'alice', name: 'Alice', avatar_url: 'https://avatars/a' },
          state: 'unreviewed',
        },
        {
          user: { username: 'bob', name: 'Bob' },
          state: 'approved',
        },
      ]),
    )
    const gateway = createHttpGitlabGateway({
      baseUrl: 'https://gitlab.example',
      token: 't',
      projectPath: 'g/p',
      fetch: fetchFn,
    })
    const result = await gateway.getMrReviewers(1)
    if (!result.ok) throw new Error('expected ok')
    expect(result.value).toEqual([
      {
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: 'https://avatars/a',
        state: 'unreviewed',
      },
      { username: 'bob', displayName: 'Bob', avatarUrl: null, state: 'approved' },
    ])
  })
})
