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

export const gitlabClient = {
  async getCurrentUser(): Promise<GitlabUser> {
    if (cachedCurrentUser !== null) return cachedCurrentUser
    const user = await request<GitlabUser>('/api/v4/user')
    cachedCurrentUser = user
    return user
  },
}
