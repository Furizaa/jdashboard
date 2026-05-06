import { getServerEnv } from '~/server/env'

export class GitlabAuthError extends Error {
  override readonly name = 'GitlabAuthError'
}

export class GitlabHttpError extends Error {
  override readonly name = 'GitlabHttpError'
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
  }
}

export type GitlabUser = {
  id: number
  username: string
  name: string
  avatar_url?: string
}

export type GitlabMrSummary = {
  iid: number
  title: string
  web_url: string
  state: 'opened' | 'closed' | 'merged' | 'locked'
  draft: boolean
  updated_at: string
}

export type GitlabReviewer = {
  id: number
  username: string
  name: string
  avatar_url?: string
}

export type GitlabMrDetail = GitlabMrSummary & {
  reviewers: GitlabReviewer[]
  head_pipeline: { status: string } | null
  has_conflicts: boolean
}

export type GitlabNote = {
  id: number
  author: { id: number; username: string; name: string }
  resolvable: boolean
  resolved: boolean
}

export type GitlabDiscussion = {
  id: string
  notes: GitlabNote[]
}

export type GitlabApprovals = {
  approved_by: Array<{ user: { id: number; username: string; name: string } }>
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const env = getServerEnv()
  const url = `${env.GITLAB_BASE_URL}${path}`
  const headers: Record<string, string> = {
    'PRIVATE-TOKEN': env.GITLAB_TOKEN,
    Accept: 'application/json',
  }
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, {
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

let cachedCurrentUser: GitlabUser | null = null

function encodedProjectPath(): string {
  return encodeURIComponent(getServerEnv().GITLAB_PROJECT_PATH)
}

export type ListMrsOptions = {
  state: ReadonlyArray<'opened' | 'merged'>
  updatedAfter: Date
  authorUsername: string
}

export const gitlabClient = {
  async getCurrentUser(): Promise<GitlabUser> {
    if (cachedCurrentUser !== null) return cachedCurrentUser
    const user = await request<GitlabUser>('/api/v4/user')
    cachedCurrentUser = user
    return user
  },

  async listMrs(options: ListMrsOptions): Promise<GitlabMrSummary[]> {
    const projectPath = encodedProjectPath()
    const updatedAfterIso = options.updatedAfter.toISOString()
    const requests = options.state.map((state) => {
      const params = new URLSearchParams({
        state,
        author_username: options.authorUsername,
        updated_after: updatedAfterIso,
        per_page: '100',
        order_by: 'updated_at',
        sort: 'desc',
      })
      return request<GitlabMrSummary[]>(
        `/api/v4/projects/${projectPath}/merge_requests?${params.toString()}`,
      )
    })
    const results = await Promise.all(requests)
    return results.flat()
  },

  async getMr(iid: number): Promise<GitlabMrDetail> {
    const projectPath = encodedProjectPath()
    return await request<GitlabMrDetail>(
      `/api/v4/projects/${projectPath}/merge_requests/${iid}`,
    )
  },

  async getMrDiscussions(iid: number): Promise<GitlabDiscussion[]> {
    const projectPath = encodedProjectPath()
    const params = new URLSearchParams({ per_page: '100' })
    return await request<GitlabDiscussion[]>(
      `/api/v4/projects/${projectPath}/merge_requests/${iid}/discussions?${params.toString()}`,
    )
  },

  async getMrApprovals(iid: number): Promise<GitlabApprovals> {
    const projectPath = encodedProjectPath()
    return await request<GitlabApprovals>(
      `/api/v4/projects/${projectPath}/merge_requests/${iid}/approvals`,
    )
  },
}
