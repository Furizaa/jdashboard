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

function authHeader(email: string, token: string): string {
  const encoded = Buffer.from(`${email}:${token}`, 'utf8').toString('base64')
  return `Basic ${encoded}`
}

async function request<T>(path: string): Promise<T> {
  const env = getServerEnv()
  const url = `${env.JIRA_BASE_URL}${path}`
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(env.JIRA_EMAIL, env.JIRA_API_TOKEN),
      Accept: 'application/json',
    },
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
}
