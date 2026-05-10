import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type {
  AdfNode,
  DetailIssue,
  IssueLink,
  LinkedIssueRef,
  MediaMetadata,
  RawComment,
  RawDetailedIssue,
  RawIssueLink,
  RawLinkedRef,
  RawSearchResponse,
  StatusCategoryKey,
} from '../../../gateways/jira/types'
import { DetailConfig } from '../config'
import { collectMediaIds, enrichAdfWithMedia } from '../domain/enrich-adf-with-media'
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

function collectIssueMediaIds(issue: DetailIssue): readonly string[] {
  const ids: string[] = []
  for (const id of collectMediaIds(issue.description)) ids.push(id)
  for (const comment of issue.comments) {
    for (const id of collectMediaIds(comment.body)) ids.push(id)
  }
  return ids
}

function dedupe(ids: readonly string[]): readonly string[] {
  return Array.from(new Set(ids))
}

function buildMediaMap(metadata: readonly MediaMetadata[]): ReadonlyMap<string, MediaMetadata> {
  return new Map(metadata.map((m) => [m.id, m]))
}

function applyMediaEnrichment(
  issue: DetailIssue,
  mediaUrlMap: ReadonlyMap<string, MediaMetadata>,
): DetailIssue {
  if (mediaUrlMap.size === 0) return issue
  return {
    ...issue,
    description: enrichAdfWithMedia(issue.description, mediaUrlMap),
    comments: issue.comments.map((c) => ({
      ...c,
      body: enrichAdfWithMedia(c.body, mediaUrlMap),
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
    const ids = dedupe(collectIssueMediaIds(issue))
    const metadata =
      ids.length === 0
        ? []
        : yield* jira
            .getMediaMetadata(ids)
            .pipe(
              Effect.catchAll((error) =>
                Effect.logWarning(
                  `[loadIssue] media metadata resolution failed for ${ids.length} id(s): ${error.message}`,
                ).pipe(Effect.as([] as readonly MediaMetadata[])),
              ),
            )
    const enriched = applyMediaEnrichment(issue, buildMediaMap(metadata))
    return { baseUrl: config.baseUrl, issue: enriched }
  })
