import { Schema } from 'effect'

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

// Wire shape returned by GET /rest/api/3/myself; the gateway maps this to the
// public `JiraUser` after decoding (largest available avatar wins).
export const JiraUserResponseSchema = Schema.Struct({
  accountId: Schema.String,
  displayName: Schema.String,
  avatarUrls: Schema.Record({ key: Schema.String, value: Schema.String }),
})

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

// `status.name` stays Schema.String — HDR statuses mix ALL-CAPS and Title Case
// so a literal-union would reject valid values.
const StatusFieldSchema = Schema.Struct({
  name: Schema.String,
  statusCategory: Schema.optional(Schema.Struct({ key: Schema.String, name: Schema.String })),
})

export const RawLinkedRefSchema = Schema.Struct({
  key: Schema.String,
  fields: Schema.optional(
    Schema.Struct({
      summary: Schema.optional(Schema.String),
      status: Schema.optional(StatusFieldSchema),
      issuetype: Schema.optional(Schema.Struct({ name: Schema.String })),
    }),
  ),
})
export type RawLinkedRef = Schema.Schema.Type<typeof RawLinkedRefSchema>

export const RawIssueSchema = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  fields: Schema.Struct({
    summary: Schema.String,
    status: StatusFieldSchema,
    labels: Schema.optional(Schema.Array(Schema.String)),
    issuetype: Schema.optional(Schema.Struct({ name: Schema.String })),
    parent: Schema.optional(Schema.NullOr(RawLinkedRefSchema)),
  }),
})
export type RawIssue = Schema.Schema.Type<typeof RawIssueSchema>

export const RawSearchResponseSchema = Schema.Struct({
  issues: Schema.Array(RawIssueSchema),
  nextPageToken: Schema.optional(Schema.String),
  isLast: Schema.optional(Schema.Boolean),
})
export type RawSearchResponse = Schema.Schema.Type<typeof RawSearchResponseSchema>

export const RawIssueLinkSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Struct({
    name: Schema.String,
    inward: Schema.String,
    outward: Schema.String,
  }),
  inwardIssue: Schema.optional(RawLinkedRefSchema),
  outwardIssue: Schema.optional(RawLinkedRefSchema),
})
export type RawIssueLink = Schema.Schema.Type<typeof RawIssueLinkSchema>

// `body` carries ADF; ADF validation is a separate concern and the walker
// tolerates malformed structures, so we leave it Schema.Unknown here.
export const RawCommentSchema = Schema.Struct({
  id: Schema.String,
  author: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        displayName: Schema.String,
        avatarUrls: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
      }),
    ),
  ),
  created: Schema.String,
  body: Schema.optional(Schema.Unknown),
})
export type RawComment = Schema.Schema.Type<typeof RawCommentSchema>

export const RawAttachmentSchema = Schema.Struct({
  id: Schema.String,
  filename: Schema.String,
  mimeType: Schema.String,
})
export type RawAttachment = Schema.Schema.Type<typeof RawAttachmentSchema>

// `priority.name` stays Schema.String — the 'Undefined' sentinel must not be
// rejected here; loadIssue's pickPriorityName normalizes it to null later.
// `description` carries ADF — kept Schema.Unknown for the same reason as
// RawCommentSchema's body.
export const RawDetailedIssueSchema = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  fields: Schema.Struct({
    summary: Schema.String,
    status: StatusFieldSchema,
    issuetype: Schema.optional(Schema.Struct({ name: Schema.String })),
    labels: Schema.optional(Schema.Array(Schema.String)),
    priority: Schema.optional(Schema.NullOr(Schema.Struct({ name: Schema.String }))),
    assignee: Schema.optional(Schema.NullOr(Schema.Struct({ displayName: Schema.String }))),
    reporter: Schema.optional(Schema.NullOr(Schema.Struct({ displayName: Schema.String }))),
    description: Schema.optional(Schema.Unknown),
    parent: Schema.optional(Schema.NullOr(RawLinkedRefSchema)),
    issuelinks: Schema.optional(Schema.Array(RawIssueLinkSchema)),
    comment: Schema.optional(Schema.Struct({ comments: Schema.Array(RawCommentSchema) })),
    attachment: Schema.optional(Schema.Array(RawAttachmentSchema)),
  }),
})
export type RawDetailedIssue = Schema.Schema.Type<typeof RawDetailedIssueSchema>

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
