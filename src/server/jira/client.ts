import { getServerEnv } from '~/server/env'

export class JiraAuthError extends Error {
  override readonly name = 'JiraAuthError'
}

export class JiraHttpError extends Error {
  override readonly name = 'JiraHttpError'
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
  }
}

export type JiraMyself = {
  accountId: string
  displayName: string
  emailAddress?: string
  avatarUrls: Record<string, string>
}

export type JiraIssue = {
  id: string
  key: string
  fields: {
    summary: string
    status: {
      name: string
      statusCategory?: { key: string; name: string }
    }
    labels?: string[]
    issuetype?: {
      name: string
    }
  }
}

export type JiraSearchResponse = {
  issues: JiraIssue[]
  nextPageToken?: string
  isLast?: boolean
}

type JiraLinkedRef = {
  key: string
  fields?: {
    summary?: string
    status?: { name: string }
    issuetype?: { name: string }
  }
}

export type JiraDetailedIssue = {
  id: string
  key: string
  fields: {
    summary: string
    status: { name: string }
    issuetype?: { name: string }
    labels?: string[]
    priority?: { name: string } | null
    assignee?: { displayName: string } | null
    reporter?: { displayName: string } | null
    description?: unknown
    parent?: JiraLinkedRef | null
    subtasks?: JiraLinkedRef[]
    issuelinks?: Array<{
      id: string
      type: { name: string; inward: string; outward: string }
      inwardIssue?: JiraLinkedRef
      outwardIssue?: JiraLinkedRef
    }>
    comment?: {
      comments: Array<{
        id: string
        author?: { displayName: string; avatarUrls?: Record<string, string> } | null
        created: string
        body?: unknown
      }>
    }
  }
}

function authHeader(email: string, token: string): string {
  const encoded = Buffer.from(`${email}:${token}`, 'utf8').toString('base64')
  return `Basic ${encoded}`
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const env = getServerEnv()
  const url = `${env.JIRA_BASE_URL}${path}`
  const headers: Record<string, string> = {
    Authorization: authHeader(env.JIRA_EMAIL, env.JIRA_API_TOKEN),
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
    throw new JiraAuthError('Invalid Jira credentials')
  }
  if (!res.ok) {
    const body = await res.text()
    throw new JiraHttpError(`Jira request failed: ${res.status}`, res.status, body)
  }
  return (await res.json()) as T
}

export const jiraClient = {
  async getMyself(): Promise<JiraMyself> {
    return await request<JiraMyself>('/rest/api/3/myself')
  },

  async searchIssues(jql: string, fields: readonly string[]): Promise<JiraSearchResponse> {
    return await request<JiraSearchResponse>('/rest/api/3/search/jql', {
      method: 'POST',
      body: { jql, fields, maxResults: 100 },
    })
  },

  async getIssue(key: string, fields: readonly string[]): Promise<JiraDetailedIssue> {
    const params = new URLSearchParams({ fields: fields.join(',') })
    return await request<JiraDetailedIssue>(
      `/rest/api/3/issue/${encodeURIComponent(key)}?${params.toString()}`,
    )
  },
}
