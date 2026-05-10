import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type {
  AdfNode,
  DetailIssue,
  IssueLink,
  LinkedIssueRef,
  RawAttachment,
  RawComment,
  RawDetailedIssue,
  RawIssueLink,
  RawLinkedRef,
  RawSearchResponse,
  StatusCategoryKey,
} from '../../../gateways/jira/types'
import { DetailConfig } from '../config'
import { type AttachmentRef, enrichAdfWithMedia } from '../domain/enrich-adf-with-media'
import type { LoadIssueError } from '../errors'

export type LoadIssueOk = {
  readonly baseUrl: string
  readonly issue: DetailIssue
}

const DETAIL_ISSUE_FIELDS = [
  'summary',
  'status',
  'labels',
  'issuetype',
  'priority',
  'assignee',
  'reporter',
  'description',
  'parent',
  'issuelinks',
  'comment',
  'attachment',
] as const

const SUB_ISSUE_FIELDS = ['summary', 'status', 'issuetype'] as const

const STATUS_CATEGORY_KEYS = ['new', 'indeterminate', 'done', 'undefined'] as const

function parseStatusCategory(key: string | undefined): StatusCategoryKey {
  return (STATUS_CATEGORY_KEYS as readonly string[]).includes(key ?? '')
    ? (key as StatusCategoryKey)
    : 'undefined'
}

function toLinkedRef(ref: RawLinkedRef): LinkedIssueRef {
  return {
    key: ref.key,
    summary: ref.fields?.summary ?? '',
    typeName: ref.fields?.issuetype?.name ?? 'Task',
    statusName: ref.fields?.status?.name ?? '',
    statusCategory: parseStatusCategory(ref.fields?.status?.statusCategory?.key),
  }
}

function toIssueLink(link: RawIssueLink): IssueLink | null {
  if (link.outwardIssue) {
    return {
      id: link.id,
      typeName: link.type.name,
      direction: 'outward',
      relationship: link.type.outward,
      issue: toLinkedRef(link.outwardIssue),
    }
  }
  if (link.inwardIssue) {
    return {
      id: link.id,
      typeName: link.type.name,
      direction: 'inward',
      relationship: link.type.inward,
      issue: toLinkedRef(link.inwardIssue),
    }
  }
  return null
}

const AVATAR_SIZES = ['48x48', '32x32', '24x24', '16x16'] as const

function pickAvatarUrl(urls: Record<string, string> | undefined): string | null {
  if (urls === undefined) return null
  for (const size of AVATAR_SIZES) {
    const url = urls[size]
    if (url !== undefined) return url
  }
  return null
}

function toComment(c: RawComment) {
  return {
    id: c.id,
    authorName: c.author?.displayName ?? null,
    authorAvatarUrl: pickAvatarUrl(c.author?.avatarUrls),
    created: c.created,
    body: (c.body as AdfNode | null | undefined) ?? null,
  }
}

function pickPriorityName(name: string | undefined): string | null {
  if (!name) return null
  return name.toLowerCase() === 'undefined' ? null : name
}

function shapeLinks(rawLinks: readonly RawIssueLink[] | undefined): IssueLink[] {
  return (rawLinks ?? []).map(toIssueLink).filter((l): l is IssueLink => l !== null)
}

function asAdfOrNull(value: unknown): AdfNode | null {
  return (value as AdfNode | null | undefined) ?? null
}

function shapePeople(f: RawDetailedIssue['fields']): {
  assigneeName: string | null
  reporterName: string | null
} {
  return {
    assigneeName: f.assignee?.displayName ?? null,
    reporterName: f.reporter?.displayName ?? null,
  }
}

function shapeMeta(f: RawDetailedIssue['fields']): {
  typeName: string
  labels: string[]
  priorityName: string | null
} {
  return {
    typeName: f.issuetype?.name ?? 'Task',
    labels: f.labels ?? [],
    priorityName: pickPriorityName(f.priority?.name),
  }
}

function shapeIssue(input: {
  detailed: RawDetailedIssue
  subSearch: RawSearchResponse
}): DetailIssue {
  const { detailed, subSearch } = input
  const f = detailed.fields
  return {
    key: detailed.key,
    summary: f.summary,
    description: asAdfOrNull(f.description),
    statusName: f.status.name,
    ...shapeMeta(f),
    ...shapePeople(f),
    parent: f.parent ? toLinkedRef(f.parent) : null,
    subIssues: subSearch.issues.map(toLinkedRef),
    links: shapeLinks(f.issuelinks),
    comments: (f.comment?.comments ?? []).map(toComment),
  }
}

// Filename collisions inside one issue: first-wins. Subsequent attachments
// with the same filename render as the placeholder. Documented Phase 1
// limitation — collisions are rare; degrades gracefully.
function buildAttachmentByFilename(
  attachments: readonly RawAttachment[],
): ReadonlyMap<string, AttachmentRef> {
  const out = new Map<string, AttachmentRef>()
  for (const a of attachments) {
    if (!out.has(a.filename)) {
      out.set(a.filename, { attachmentId: a.id, mimeType: a.mimeType })
    }
  }
  return out
}

function applyMediaEnrichment(
  issue: DetailIssue,
  attachmentByFilename: ReadonlyMap<string, AttachmentRef>,
): DetailIssue {
  if (attachmentByFilename.size === 0) return issue
  return {
    ...issue,
    description: enrichAdfWithMedia(issue.description, attachmentByFilename),
    comments: issue.comments.map((c) => ({
      ...c,
      body: enrichAdfWithMedia(c.body, attachmentByFilename),
    })),
  }
}

export const loadIssue = (
  key: string,
): Effect.Effect<LoadIssueOk, LoadIssueError, JiraGateway | DetailConfig> =>
  Effect.gen(function* () {
    const jira = yield* JiraGateway
    const config = yield* DetailConfig
    const [detailed, subSearch] = yield* Effect.all(
      [
        jira.getIssue(key, DETAIL_ISSUE_FIELDS).pipe(
          Effect.catchTags({
            Rejected: (e) => Effect.die(e),
          }),
        ),
        jira.searchIssues(`parent = "${key}"`, SUB_ISSUE_FIELDS).pipe(
          Effect.catchTags({
            NotFound: (e) => Effect.die(e),
            Rejected: (e) => Effect.die(e),
          }),
        ),
      ],
      { concurrency: 'unbounded' },
    )
    const issue = shapeIssue({ detailed, subSearch })
    const attachmentByFilename = buildAttachmentByFilename(detailed.fields.attachment ?? [])
    const enriched = applyMediaEnrichment(issue, attachmentByFilename)
    return { baseUrl: config.baseUrl, issue: enriched }
  })
