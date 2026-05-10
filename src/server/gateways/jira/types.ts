type AdfMark = { type: string; attrs?: Record<string, string | number | boolean | null> }

export type AdfNode = {
  type?: string
  version?: number
  text?: string
  attrs?: Record<string, string | number | boolean | null>
  marks?: AdfMark[]
  content?: AdfNode[]
}

export type JiraUser = {
  accountId: string
  displayName: string
  avatarUrl: string
}

export type GatewayCreatedIssue = { key: string }

export type AllowedTransition = {
  id: string
  name: string
  toStatusName: string
}

export type StatusCategoryKey = 'new' | 'indeterminate' | 'done' | 'undefined'

export type LinkedIssueRef = {
  key: string
  summary: string
  typeName: string
  statusName: string
  statusCategory: StatusCategoryKey
}

export type IssueLink = {
  id: string
  typeName: string
  direction: 'inward' | 'outward'
  relationship: string
  issue: LinkedIssueRef
}

export type BoardIssue = {
  key: string
  summary: string
  statusName: string
  typeName: string
  labels: string[]
  epic: { key: string; summary: string } | null
}

export type DetailIssue = {
  key: string
  summary: string
  description: AdfNode | null
  statusName: string
  typeName: string
  labels: string[]
  priorityName: string | null
  assigneeName: string | null
  reporterName: string | null
  parent: LinkedIssueRef | null
  subIssues: LinkedIssueRef[]
  links: IssueLink[]
  comments: Array<{
    id: string
    authorName: string | null
    authorAvatarUrl: string | null
    created: string
    body: AdfNode | null
  }>
}

export type EpicRef = { key: string; summary: string }

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

export type RawIssueLink = {
  id: string
  type: { name: string; inward: string; outward: string }
  inwardIssue?: RawLinkedRef
  outwardIssue?: RawLinkedRef
}

export type RawComment = {
  id: string
  author?: { displayName: string; avatarUrls?: Record<string, string> } | null
  created: string
  body?: unknown
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
    issuelinks?: RawIssueLink[]
    comment?: { comments: RawComment[] }
  }
}

export type MediaMetadata = {
  readonly id: string
  readonly mimeType: string
  readonly width?: number
  readonly height?: number
}

export type MediaStream = {
  readonly stream: ReadableStream<Uint8Array>
  readonly mimeType: string
  readonly contentLength?: number
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
