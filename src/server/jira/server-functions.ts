import { createServerFn } from '@tanstack/react-start'
import { jiraClient, JiraAuthError, JiraHttpError, type AdfNode } from './client'
import { buildBoardJql } from './jql'
import { buildCreatePayload } from './quick-create-payload'
import { quickCreateSchema } from './quick-create-schema'
import { getServerEnv } from '~/server/env'

export type { AdfNode }

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
  epic: { key: string; summary: string } | null
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
          priorityName:
            f.priority?.name && f.priority.name.toLowerCase() !== 'undefined'
              ? f.priority.name
              : null,
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

export type AllowedTransition = {
  id: string
  name: string
  toStatusName: string
}

export type GetTransitionsResult =
  | { ok: true; transitions: AllowedTransition[] }
  | { ok: false; reason: 'unauthorized' | 'not-found' }

export const getTransitions = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => {
    if (!data || typeof data.key !== 'string' || data.key.trim() === '') {
      throw new Error('getTransitions: key is required')
    }
    return { key: data.key.trim() }
  })
  .handler(async ({ data }): Promise<GetTransitionsResult> => {
    try {
      const response = await jiraClient.getTransitions(data.key)
      return {
        ok: true,
        transitions: response.transitions.map((t) => ({
          id: t.id,
          name: t.name,
          toStatusName: t.to.name,
        })),
      }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      if (err instanceof JiraHttpError && err.status === 404) {
        return { ok: false, reason: 'not-found' }
      }
      throw err
    }
  })

export type TransitionIssueResult =
  | { ok: true }
  | { ok: false; reason: 'unauthorized' | 'rejected'; message: string }

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
  return body || 'Jira rejected the transition'
}

export const transitionIssue = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string; transitionId: string }) => {
    if (!data || typeof data.key !== 'string' || data.key.trim() === '') {
      throw new Error('transitionIssue: key is required')
    }
    if (typeof data.transitionId !== 'string' || data.transitionId.trim() === '') {
      throw new Error('transitionIssue: transitionId is required')
    }
    return { key: data.key.trim(), transitionId: data.transitionId.trim() }
  })
  .handler(async ({ data }): Promise<TransitionIssueResult> => {
    try {
      await jiraClient.transitionIssue(data.key, data.transitionId)
      return { ok: true }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized', message: 'Invalid Jira credentials' }
      }
      if (err instanceof JiraHttpError) {
        return { ok: false, reason: 'rejected', message: parseJiraErrorMessage(err.body) }
      }
      throw err
    }
  })

export type CreateIssueResult =
  | { ok: true; key: string }
  | { ok: false; reason: 'unauthorized' | 'rejected'; message: string }

export const createIssue = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    const parsed = quickCreateSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error(`createIssue: invalid input — ${parsed.error.message}`)
    }
    return parsed.data
  })
  .handler(async ({ data }): Promise<CreateIssueResult> => {
    const env = getServerEnv()
    try {
      const me = await jiraClient.getMyself()
      const body = buildCreatePayload({
        form: data,
        currentUser: { accountId: me.accountId },
        projectKey: env.JIRA_PROJECT_KEY,
      })
      const created = await jiraClient.createIssue(body)
      return { ok: true, key: created.key }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized', message: 'Invalid Jira credentials' }
      }
      if (err instanceof JiraHttpError) {
        return { ok: false, reason: 'rejected', message: parseJiraErrorMessage(err.body) }
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
        'parent',
      ])
      const issues: BoardIssue[] = response.issues.map((issue) => {
        const parent = issue.fields.parent
        const parentIsEpic = parent?.fields?.issuetype?.name?.toLowerCase() === 'epic'
        return {
          key: issue.key,
          summary: issue.fields.summary,
          statusName: issue.fields.status.name,
          typeName: issue.fields.issuetype?.name ?? 'Task',
          labels: (issue.fields.labels ?? []).filter((label) => !hideSet.has(label.toLowerCase())),
          epic:
            parentIsEpic && parent
              ? { key: parent.key, summary: parent.fields?.summary ?? parent.key }
              : null,
        }
      })
      return { ok: true, baseUrl: env.JIRA_BASE_URL, issues }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      throw err
    }
  },
)
