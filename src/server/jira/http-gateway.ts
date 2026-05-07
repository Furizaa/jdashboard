import type {
  GatewayCreatedIssue,
  GatewayTransition,
  GatewayUser,
  JiraGateway,
  JiraResult,
  RawDetailedIssue,
  RawSearchResponse,
} from './gateway'

class JiraAuthError extends Error {
  override readonly name = 'JiraAuthError'
}

class JiraHttpError extends Error {
  override readonly name = 'JiraHttpError'
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
  email: string
  apiToken: string
  fetch?: FetchFn
}

function authHeader(email: string, token: string): string {
  const encoded = Buffer.from(`${email}:${token}`, 'utf8').toString('base64')
  return `Basic ${encoded}`
}

function parseJiraErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      errorMessages?: string[]
      errors?: Record<string, string>
    }
    if (Array.isArray(parsed.errorMessages) && parsed.errorMessages.length > 0) {
      return parsed.errorMessages.join(' ')
    }
    if (parsed.errors && typeof parsed.errors === 'object') {
      const values = Object.values(parsed.errors).filter((v): v is string => typeof v === 'string')
      if (values.length > 0) return values.join(' ')
    }
  } catch {
    // fall through
  }
  return body || 'Jira request was rejected'
}

export function createHttpJiraGateway(deps: Deps): JiraGateway {
  const fetchFn: FetchFn = deps.fetch ?? fetch
  const baseAuth = authHeader(deps.email, deps.apiToken)

  async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const url = `${deps.baseUrl}${path}`
    const headers: Record<string, string> = {
      Authorization: baseAuth,
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
      throw new JiraAuthError('Invalid Jira credentials')
    }
    if (!res.ok) {
      const body = await res.text()
      throw new JiraHttpError(`Jira request failed: ${res.status}`, res.status, body)
    }
    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  }

  async function call<T>(fn: () => Promise<T>): Promise<JiraResult<T>> {
    try {
      const value = await fn()
      return { ok: true, value }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      if (err instanceof JiraHttpError) {
        if (err.status === 404) return { ok: false, reason: 'not-found' }
        return { ok: false, reason: 'rejected', message: parseJiraErrorMessage(err.body) }
      }
      throw err
    }
  }

  return {
    getMyself() {
      return call<GatewayUser>(async () => {
        const me = await request<{
          accountId: string
          displayName: string
          avatarUrls: Record<string, string>
        }>('/rest/api/3/myself')
        const avatarUrl =
          me.avatarUrls['48x48'] ?? me.avatarUrls['32x32'] ?? me.avatarUrls['24x24'] ?? ''
        return { accountId: me.accountId, displayName: me.displayName, avatarUrl }
      })
    },

    searchIssues(jql, fields) {
      return call<RawSearchResponse>(() =>
        request<RawSearchResponse>('/rest/api/3/search/jql', {
          method: 'POST',
          body: { jql, fields, maxResults: 100 },
        }),
      )
    },

    getIssue(key, fields) {
      return call<RawDetailedIssue>(() => {
        const params = new URLSearchParams({ fields: fields.join(',') })
        return request<RawDetailedIssue>(
          `/rest/api/3/issue/${encodeURIComponent(key)}?${params.toString()}`,
        )
      })
    },

    getTransitions(key) {
      return call<GatewayTransition[]>(async () => {
        const resp = await request<{
          transitions: Array<{ id: string; name: string; to: { name: string } }>
        }>(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`)
        return resp.transitions.map((t) => ({
          id: t.id,
          name: t.name,
          toStatusName: t.to.name,
        }))
      })
    },

    transitionIssue(key, transitionId) {
      return call<void>(async () => {
        await request<void>(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
          method: 'POST',
          body: { transition: { id: transitionId } },
        })
      })
    },

    createIssue(body) {
      return call<GatewayCreatedIssue>(async () => {
        const created = await request<{ id: string; key: string; self: string }>(
          '/rest/api/3/issue',
          {
            method: 'POST',
            body,
          },
        )
        return { key: created.key }
      })
    },
  }
}
