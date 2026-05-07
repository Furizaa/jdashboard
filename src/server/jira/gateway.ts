type AdfMark = { type: string; attrs?: Record<string, string | number | boolean | null> }

export type AdfNode = {
  type?: string
  version?: number
  text?: string
  attrs?: Record<string, string | number | boolean | null>
  marks?: AdfMark[]
  content?: AdfNode[]
}

export type JiraResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'rejected'; message: string }

export type GatewayUser = {
  accountId: string
  displayName: string
  avatarUrl: string
}

export type GatewayCreatedIssue = { key: string }

export type GatewayTransition = {
  id: string
  name: string
  toStatusName: string
}

export type RawLinkedRef = {
  key: string
  fields?: {
    summary?: string
    status?: { name: string; statusCategory?: { key: string; name: string } }
    issuetype?: { name: string }
  }
}

export type RawIssue = {
  id: string
  key: string
  fields: {
    summary: string
    status: { name: string; statusCategory?: { key: string; name: string } }
    labels?: string[]
    issuetype?: { name: string }
    parent?: RawLinkedRef | null
  }
}

export type RawSearchResponse = {
  issues: RawIssue[]
  nextPageToken?: string
  isLast?: boolean
}

export type RawDetailedIssue = {
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
    parent?: RawLinkedRef | null
    issuelinks?: Array<{
      id: string
      type: { name: string; inward: string; outward: string }
      inwardIssue?: RawLinkedRef
      outwardIssue?: RawLinkedRef
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

export type CreateIssueBody = {
  fields: {
    project: { key: string }
    issuetype: { name: string }
    summary: string
    description: AdfNode
    priority: { name: string }
    labels: string[]
    parent: { key: string }
    assignee: { accountId: string }
  }
}

export interface JiraGateway {
  getMyself(): Promise<JiraResult<GatewayUser>>
  searchIssues(jql: string, fields: readonly string[]): Promise<JiraResult<RawSearchResponse>>
  getIssue(key: string, fields: readonly string[]): Promise<JiraResult<RawDetailedIssue>>
  getTransitions(key: string): Promise<JiraResult<GatewayTransition[]>>
  transitionIssue(key: string, transitionId: string): Promise<JiraResult<void>>
  createIssue(body: CreateIssueBody): Promise<JiraResult<GatewayCreatedIssue>>
}
