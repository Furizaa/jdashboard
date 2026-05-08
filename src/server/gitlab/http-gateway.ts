import type {
  GatewayUser,
  GitlabGateway,
  GitlabResult,
  ListMrsQuery,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrReviewerWithState,
  RawMrSummary,
  ReviewerEndpointState,
} from './gateway'

class GitlabAuthError extends Error {
  override readonly name = 'GitlabAuthError'
}

class GitlabHttpError extends Error {
  override readonly name = 'GitlabHttpError'
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
  }
}

type FetchFn = typeof fetch

type Deps = {
  baseUrl: string
  token: string
  projectPath: string
  fetch?: FetchFn
}

type WireUser = { username: string; name: string }

type WireMrSummary = {
  iid: number
  title: string
  web_url: string
  state: 'opened' | 'closed' | 'merged' | 'locked'
  draft: boolean
  updated_at: string
}

type WireReviewer = {
  username: string
  name: string
  avatar_url?: string | null
}

type WireMrDetail = WireMrSummary & {
  reviewers: WireReviewer[]
  head_pipeline: { status: string } | null
  has_conflicts: boolean
}

type WireNote = {
  author: { username: string }
  resolvable: boolean
  resolved: boolean
}

type WireDiscussion = {
  id: string
  notes: WireNote[]
}

type WireApprovals = {
  approved_by: Array<{ user: { username: string } }>
}

type WireReviewerWithState = {
  username: string
  name: string
  avatar_url?: string | null
  state: ReviewerEndpointState
}

function toRawMrSummary(wire: WireMrSummary): RawMrSummary {
  return {
    iid: wire.iid,
    title: wire.title,
    webUrl: wire.web_url,
    state: wire.state,
    draft: wire.draft,
    updatedAt: wire.updated_at,
  }
}

function toRawMrDetail(wire: WireMrDetail): RawMrDetail {
  return {
    ...toRawMrSummary(wire),
    reviewers: wire.reviewers.map((r) => ({
      username: r.username,
      displayName: r.name,
      avatarUrl: r.avatar_url ?? null,
    })),
    headPipelineStatus: wire.head_pipeline?.status ?? null,
    hasConflicts: wire.has_conflicts,
  }
}

function toRawDiscussion(wire: WireDiscussion): RawDiscussion {
  return {
    id: wire.id,
    notes: wire.notes.map((n) => ({
      authorUsername: n.author.username,
      resolvable: n.resolvable,
      resolved: n.resolved,
    })),
  }
}

function parseGitlabErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      message?: string | string[]
      error?: string
      error_description?: string
    }
    if (typeof parsed.message === 'string') return parsed.message
    if (Array.isArray(parsed.message)) return parsed.message.join(' ')
    if (typeof parsed.error_description === 'string') return parsed.error_description
    if (typeof parsed.error === 'string') return parsed.error
  } catch {
    // fall through
  }
  return body || 'GitLab request was rejected'
}

export function createHttpGitlabGateway(deps: Deps): GitlabGateway {
  const fetchFn: FetchFn = deps.fetch ?? fetch
  const projectPath = encodeURIComponent(deps.projectPath)

  async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const url = `${deps.baseUrl}${path}`
    const headers: Record<string, string> = {
      'PRIVATE-TOKEN': deps.token,
      Accept: 'application/json',
    }
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const res = await fetchFn(url, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })

    if (res.status === 401) {
      throw new GitlabAuthError('Invalid GitLab credentials')
    }
    if (!res.ok) {
      const body = await res.text()
      throw new GitlabHttpError(`GitLab request failed: ${res.status}`, res.status, body)
    }
    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  }

  async function call<T>(fn: () => Promise<T>): Promise<GitlabResult<T>> {
    try {
      const value = await fn()
      return { ok: true, value }
    } catch (err) {
      if (err instanceof GitlabAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      if (err instanceof GitlabHttpError) {
        if (err.status === 404) return { ok: false, reason: 'not-found' }
        return { ok: false, reason: 'rejected', message: parseGitlabErrorMessage(err.body) }
      }
      throw err
    }
  }

  return {
    getCurrentUser() {
      return call<GatewayUser>(async () => {
        const u = await request<WireUser>('/api/v4/user')
        return { username: u.username, displayName: u.name }
      })
    },

    listMrs(query: ListMrsQuery) {
      return call<RawMrSummary[]>(async () => {
        const updatedAfterIso = query.updatedAfter.toISOString()
        const userParam: [string, string] =
          'reviewerUsername' in query
            ? ['reviewer_username', query.reviewerUsername]
            : ['author_username', query.authorUsername]
        const requests = query.states.map((state) => {
          const params = new URLSearchParams({
            state,
            [userParam[0]]: userParam[1],
            updated_after: updatedAfterIso,
            per_page: '100',
            order_by: 'updated_at',
            sort: 'desc',
          })
          return request<WireMrSummary[]>(
            `/api/v4/projects/${projectPath}/merge_requests?${params.toString()}`,
          )
        })
        const results = await Promise.all(requests)
        return results.flat().map(toRawMrSummary)
      })
    },

    getMr(iid) {
      return call<RawMrDetail>(async () => {
        const detail = await request<WireMrDetail>(
          `/api/v4/projects/${projectPath}/merge_requests/${iid}`,
        )
        return toRawMrDetail(detail)
      })
    },

    getMrDiscussions(iid) {
      return call<RawDiscussion[]>(async () => {
        const params = new URLSearchParams({ per_page: '100' })
        const discussions = await request<WireDiscussion[]>(
          `/api/v4/projects/${projectPath}/merge_requests/${iid}/discussions?${params.toString()}`,
        )
        return discussions.map(toRawDiscussion)
      })
    },

    getMrApprovals(iid) {
      return call<RawApprovals>(async () => {
        const wire = await request<WireApprovals>(
          `/api/v4/projects/${projectPath}/merge_requests/${iid}/approvals`,
        )
        return { approvedUsernames: wire.approved_by.map((a) => a.user.username) }
      })
    },

    getMrReviewers(iid) {
      return call<RawMrReviewerWithState[]>(async () => {
        const wire = await request<WireReviewerWithState[]>(
          `/api/v4/projects/${projectPath}/merge_requests/${iid}/reviewers`,
        )
        return wire.map((r) => ({
          username: r.username,
          displayName: r.name,
          avatarUrl: r.avatar_url ?? null,
          state: r.state,
        }))
      })
    },
  }
}
