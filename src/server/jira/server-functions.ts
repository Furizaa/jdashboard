import { createServerFn } from '@tanstack/react-start'
import { jiraClient, JiraAuthError } from './client'
import { buildBoardJql } from './jql'
import { getServerEnv } from '~/server/env'

export type StatusCategoryKey = 'new' | 'indeterminate' | 'done' | 'undefined'

export type LinkedIssueRef = {
  key: string
  summary: string
  typeName: string
  statusName: string
  statusCategory: StatusCategoryKey
}

type AdfMark = { type: string; attrs?: Record<string, string | number | boolean | null> }
export type AdfNode = {
  type?: string
  text?: string
  attrs?: Record<string, string | number | boolean | null>
  marks?: AdfMark[]
  content?: AdfNode[]
}

export type IssueLink = {
  id: string
  typeName: string
  direction: 'inward' | 'outward'
  relationship: string
  issue: LinkedIssueRef
}

export type GetMyselfResult =
  | { ok: true; user: { accountId: string; displayName: string; avatarUrl: string } }
  | { ok: false; reason: 'unauthorized' }

export const getMyself = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMyselfResult> => {
    try {
      const me = await jiraClient.getMyself()
      const avatarUrl =
        me.avatarUrls['48x48'] ?? me.avatarUrls['32x32'] ?? me.avatarUrls['24x24'] ?? ''
      return {
        ok: true,
        user: {
          accountId: me.accountId,
          displayName: me.displayName,
          avatarUrl,
        },
      }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      throw err
    }
  },
)

export type BoardIssue = {
  key: string
  summary: string
  statusName: string
  typeName: string
  labels: string[]
}

export type SearchIssuesResult =
  | { ok: true; baseUrl: string; issues: BoardIssue[] }
  | { ok: false; reason: 'unauthorized' }

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

export type GetIssueResult =
  | { ok: true; baseUrl: string; issue: DetailIssue }
  | { ok: false; reason: 'unauthorized' | 'not-found' }

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

function toLinkedRef(ref: {
  key: string
  fields?: {
    summary?: string
    status?: { name: string; statusCategory?: { key: string; name: string } }
    issuetype?: { name: string }
  }
}): LinkedIssueRef {
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

export const getIssue = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => {
    if (!data || typeof data.key !== 'string' || data.key.trim() === '') {
      throw new Error('getIssue: key is required')
    }
    return { key: data.key.trim() }
  })
  .handler(async ({ data }): Promise<GetIssueResult> => {
    const env = getServerEnv()
    try {
      const [issue, subIssuesResp] = await Promise.all([
        jiraClient.getIssue(data.key, DETAIL_ISSUE_FIELDS),
        jiraClient.searchIssues(`parent = "${data.key}"`, SUB_ISSUE_FIELDS),
      ])
      const f = issue.fields
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
        ok: true,
        baseUrl: env.JIRA_BASE_URL,
        issue: {
          key: issue.key,
          summary: f.summary,
          description: (f.description as AdfNode | null | undefined) ?? null,
          statusName: f.status.name,
          typeName: f.issuetype?.name ?? 'Task',
          labels: f.labels ?? [],
          priorityName: f.priority?.name ?? null,
          assigneeName: f.assignee?.displayName ?? null,
          reporterName: f.reporter?.displayName ?? null,
          parent: f.parent ? toLinkedRef(f.parent) : null,
          subIssues: subIssuesResp.issues.map(toLinkedRef),
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
        },
      }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      throw err
    }
  })

export const searchIssues = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SearchIssuesResult> => {
    const env = getServerEnv()
    const jql = buildBoardJql({
      projectKey: env.JIRA_PROJECT_KEY,
      label: env.JIRA_LABEL_FILTER,
      doneWindowDays: env.JIRA_DONE_WINDOW_DAYS,
    })
    const hideSet = new Set(env.JIRA_HIDE_LABELS.map((l) => l.toLowerCase()))
    try {
      const response = await jiraClient.searchIssues(jql, [
        'summary',
        'status',
        'labels',
        'issuetype',
      ])
      const issues: BoardIssue[] = response.issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
        statusName: issue.fields.status.name,
        typeName: issue.fields.issuetype?.name ?? 'Task',
        labels: (issue.fields.labels ?? []).filter((label) => !hideSet.has(label.toLowerCase())),
      }))
      return { ok: true, baseUrl: env.JIRA_BASE_URL, issues }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      throw err
    }
  },
)
