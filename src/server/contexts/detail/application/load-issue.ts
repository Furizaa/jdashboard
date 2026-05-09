import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type {
  AdfNode,
  DetailIssue,
  IssueLink,
  LinkedIssueRef,
  RawDetailedIssue,
  RawLinkedRef,
  RawSearchResponse,
  StatusCategoryKey,
} from '../../../gateways/jira/types'
import { DetailConfig } from '../config'
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

function toLinkedRef(ref: RawLinkedRef): LinkedIssueRef {
  const categoryKey = ref.fields?.status?.statusCategory?.key
  const statusCategory: StatusCategoryKey =
    categoryKey === 'new' ||
    categoryKey === 'indeterminate' ||
    categoryKey === 'done' ||
    categoryKey === 'undefined'
      ? categoryKey
      : 'undefined'
  return {
    key: ref.key,
    summary: ref.fields?.summary ?? '',
    typeName: ref.fields?.issuetype?.name ?? 'Task',
    statusName: ref.fields?.status?.name ?? '',
    statusCategory,
  }
}

function shapeIssue(input: {
  detailed: RawDetailedIssue
  subSearch: RawSearchResponse
}): DetailIssue {
  const { detailed, subSearch } = input
  const f = detailed.fields
  const links: IssueLink[] = []
  for (const link of f.issuelinks ?? []) {
    if (link.outwardIssue) {
      links.push({
        id: link.id,
        typeName: link.type.name,
        direction: 'outward',
        relationship: link.type.outward,
        issue: toLinkedRef(link.outwardIssue),
      })
    } else if (link.inwardIssue) {
      links.push({
        id: link.id,
        typeName: link.type.name,
        direction: 'inward',
        relationship: link.type.inward,
        issue: toLinkedRef(link.inwardIssue),
      })
    }
  }
  return {
    key: detailed.key,
    summary: f.summary,
    description: (f.description as AdfNode | null | undefined) ?? null,
    statusName: f.status.name,
    typeName: f.issuetype?.name ?? 'Task',
    labels: f.labels ?? [],
    priorityName:
      f.priority?.name && f.priority.name.toLowerCase() !== 'undefined' ? f.priority.name : null,
    assigneeName: f.assignee?.displayName ?? null,
    reporterName: f.reporter?.displayName ?? null,
    parent: f.parent ? toLinkedRef(f.parent) : null,
    subIssues: subSearch.issues.map(toLinkedRef),
    links,
    comments: (f.comment?.comments ?? []).map((c) => {
      const urls = c.author?.avatarUrls
      const avatar =
        urls?.['48x48'] ?? urls?.['32x32'] ?? urls?.['24x24'] ?? urls?.['16x16'] ?? null
      return {
        id: c.id,
        authorName: c.author?.displayName ?? null,
        authorAvatarUrl: avatar,
        created: c.created,
        body: (c.body as AdfNode | null | undefined) ?? null,
      }
    }),
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
    return { baseUrl: config.baseUrl, issue: shapeIssue({ detailed, subSearch }) }
  })
