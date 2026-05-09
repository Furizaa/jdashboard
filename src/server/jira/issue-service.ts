import type { EpicConfig, QuickCreateConfig } from './config'
import type { AdfNode, CreateIssueBody, JiraGateway, RawLinkedRef } from './gateway'
import type { QuickCreateInput } from '~/server/contexts/capture/application/quick-create-schema'

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

export type AllowedTransition = {
  id: string
  name: string
  toStatusName: string
}

export type EpicRef = { key: string; summary: string }

export type GetMyselfResult =
  | { ok: true; user: { accountId: string; displayName: string; avatarUrl: string } }
  | { ok: false; reason: 'unauthorized' }

export type LoadBoardResult =
  | { ok: true; baseUrl: string; issues: BoardIssue[] }
  | { ok: false; reason: 'unauthorized' }

export type BulkLoadIssuesResult =
  | { ok: true; baseUrl: string; found: BoardIssue[]; missing: string[] }
  | { ok: false; reason: 'unauthorized' }

export type LoadIssueResult =
  | { ok: true; baseUrl: string; issue: DetailIssue }
  | { ok: false; reason: 'unauthorized' | 'not-found' }

export type LoadTransitionsResult =
  | { ok: true; transitions: AllowedTransition[] }
  | { ok: false; reason: 'unauthorized' | 'not-found' }

export type PerformTransitionResult =
  | { ok: true }
  | { ok: false; reason: 'unauthorized' | 'rejected'; message: string }

export type QuickCreateResult =
  | { ok: true; key: string; baseUrl: string }
  | { ok: false; reason: 'unauthorized' | 'rejected'; message: string }

export type LoadMyEpicsResult =
  | { ok: true; epics: EpicRef[] }
  | { ok: false; reason: 'unauthorized' }

export type JiraServiceConfig = {
  baseUrl: string
  projectKey: string
  labelFilter: string
  hideLabels: readonly string[]
  doneWindowDays: number
  quickCreate: QuickCreateConfig
  epic: EpicConfig
}

export type JiraIssueService = {
  getMyself(): Promise<GetMyselfResult>
  loadBoard(): Promise<LoadBoardResult>
  loadIssue(key: string): Promise<LoadIssueResult>
  loadTransitions(key: string): Promise<LoadTransitionsResult>
  performTransition(key: string, transitionId: string): Promise<PerformTransitionResult>
  quickCreate(input: QuickCreateInput): Promise<QuickCreateResult>
  loadMyEpics(): Promise<LoadMyEpicsResult>
  bulkLoadIssues(keys: readonly string[]): Promise<BulkLoadIssuesResult>
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

const BOARD_FIELDS = ['summary', 'status', 'labels', 'issuetype', 'parent'] as const

const EPIC_FIELDS = ['summary'] as const

function quoteJqlString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function buildBoardJql(input: {
  projectKey: string
  label: string
  doneWindowDays: number
}): string {
  const { projectKey, label, doneWindowDays } = input
  return (
    [
      `project = ${projectKey}`,
      `assignee = currentUser()`,
      `labels = ${quoteJqlString(label)}`,
      `(statusCategory != Done OR status changed to Done after -${doneWindowDays}d)`,
    ].join(' AND ') + ' ORDER BY rank'
  )
}

function buildBulkIssuesJql(keys: readonly string[]): string {
  const quoted = keys.map(quoteJqlString).join(', ')
  return `key in (${quoted})`
}

function buildEpicJql(input: { projectKey: string; statuses: readonly string[] }): string {
  const statusClauses = input.statuses.map((s) => `status = ${quoteJqlString(s)}`)
  const statusFragment =
    statusClauses.length === 1 ? statusClauses[0] : `(${statusClauses.join(' OR ')})`
  return [
    `issuetype = Epic`,
    `assignee = currentUser()`,
    statusFragment,
    `project = ${quoteJqlString(input.projectKey)}`,
  ].join(' AND ')
}

function plainTextToAdf(text: string): AdfNode {
  const lines = text.split('\n')
  const content: AdfNode[] = lines.map((line) =>
    line.length === 0
      ? { type: 'paragraph' }
      : { type: 'paragraph', content: [{ type: 'text', text: line }] },
  )
  return { type: 'doc', version: 1, content }
}

function buildCreatePayload(input: {
  form: QuickCreateInput
  currentUser: { accountId: string }
  projectKey: string
  config: QuickCreateConfig
}): CreateIssueBody {
  const { form, currentUser, projectKey, config } = input
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { name: form.type },
      summary: `${config.summaryPrefix}${form.summary}`,
      description: plainTextToAdf(form.description),
      priority: { name: config.priority },
      labels: [...config.labels],
      parent: { key: form.parentKey },
      assignee: { accountId: currentUser.accountId },
    },
  }
}

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

function unexpectedReason(label: string, reason: string, message?: string): Error {
  const detail = reason === 'rejected' && message ? `${reason}: ${message}` : reason
  return new Error(`${label}: unexpected ${detail}`)
}

export function createJiraIssueService(
  gateway: JiraGateway,
  config: JiraServiceConfig,
): JiraIssueService {
  return {
    async getMyself() {
      const result = await gateway.getMyself()
      if (result.ok) {
        return { ok: true, user: result.value }
      }
      if (result.reason === 'unauthorized') {
        return { ok: false, reason: 'unauthorized' }
      }
      throw unexpectedReason(
        'getMyself',
        result.reason,
        result.reason === 'rejected' ? result.message : undefined,
      )
    },

    async loadBoard() {
      const jql = buildBoardJql({
        projectKey: config.projectKey,
        label: config.labelFilter,
        doneWindowDays: config.doneWindowDays,
      })
      const result = await gateway.searchIssues(jql, BOARD_FIELDS)
      if (!result.ok) {
        if (result.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason(
          'loadBoard',
          result.reason,
          result.reason === 'rejected' ? result.message : undefined,
        )
      }
      const hideSet = new Set(config.hideLabels.map((l) => l.toLowerCase()))
      const issues: BoardIssue[] = result.value.issues.map((issue) => {
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
      return { ok: true, baseUrl: config.baseUrl, issues }
    },

    async loadIssue(key) {
      const [issueResult, subResult] = await Promise.all([
        gateway.getIssue(key, DETAIL_ISSUE_FIELDS),
        gateway.searchIssues(`parent = "${key}"`, SUB_ISSUE_FIELDS),
      ])
      if (!issueResult.ok) {
        if (issueResult.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        if (issueResult.reason === 'not-found') {
          return { ok: false, reason: 'not-found' }
        }
        throw unexpectedReason('loadIssue', issueResult.reason, issueResult.message)
      }
      if (!subResult.ok) {
        if (subResult.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason(
          'loadIssue (sub-issues)',
          subResult.reason,
          subResult.reason === 'rejected' ? subResult.message : undefined,
        )
      }

      const f = issueResult.value.fields
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
        baseUrl: config.baseUrl,
        issue: {
          key: issueResult.value.key,
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
          subIssues: subResult.value.issues.map(toLinkedRef),
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
    },

    async loadTransitions(key) {
      const result = await gateway.getTransitions(key)
      if (result.ok) {
        return { ok: true, transitions: result.value }
      }
      if (result.reason === 'unauthorized') {
        return { ok: false, reason: 'unauthorized' }
      }
      if (result.reason === 'not-found') {
        return { ok: false, reason: 'not-found' }
      }
      throw unexpectedReason('loadTransitions', result.reason, result.message)
    },

    async performTransition(key, transitionId) {
      const result = await gateway.transitionIssue(key, transitionId)
      if (result.ok) {
        return { ok: true }
      }
      if (result.reason === 'unauthorized') {
        return { ok: false, reason: 'unauthorized', message: 'Invalid Jira credentials' }
      }
      if (result.reason === 'rejected') {
        return { ok: false, reason: 'rejected', message: result.message }
      }
      // not-found surfaces as rejected with a helpful message
      return { ok: false, reason: 'rejected', message: 'Issue not found' }
    },

    async quickCreate(input) {
      const meResult = await gateway.getMyself()
      if (!meResult.ok) {
        if (meResult.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized', message: 'Invalid Jira credentials' }
        }
        if (meResult.reason === 'rejected') {
          return { ok: false, reason: 'rejected', message: meResult.message }
        }
        throw unexpectedReason('quickCreate (getMyself)', meResult.reason)
      }

      const body = buildCreatePayload({
        form: input,
        currentUser: { accountId: meResult.value.accountId },
        projectKey: config.projectKey,
        config: config.quickCreate,
      })

      const created = await gateway.createIssue(body)
      if (!created.ok) {
        if (created.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized', message: 'Invalid Jira credentials' }
        }
        if (created.reason === 'rejected') {
          return { ok: false, reason: 'rejected', message: created.message }
        }
        throw unexpectedReason('quickCreate (createIssue)', created.reason)
      }
      return { ok: true, key: created.value.key, baseUrl: config.baseUrl }
    },

    async loadMyEpics() {
      const jql = buildEpicJql({
        projectKey: config.projectKey,
        statuses: config.epic.statuses,
      })
      const result = await gateway.searchIssues(jql, EPIC_FIELDS)
      if (!result.ok) {
        if (result.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason(
          'loadMyEpics',
          result.reason,
          result.reason === 'rejected' ? result.message : undefined,
        )
      }
      const epics: EpicRef[] = result.value.issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
      }))
      return { ok: true, epics }
    },

    async bulkLoadIssues(keys) {
      const requested = [...new Set(keys)]
      if (requested.length === 0) {
        return { ok: true, baseUrl: config.baseUrl, found: [], missing: [] }
      }
      const jql = buildBulkIssuesJql(requested)
      const result = await gateway.searchIssues(jql, BOARD_FIELDS)
      if (!result.ok) {
        if (result.reason === 'unauthorized') {
          return { ok: false, reason: 'unauthorized' }
        }
        throw unexpectedReason(
          'bulkLoadIssues',
          result.reason,
          result.reason === 'rejected' ? result.message : undefined,
        )
      }
      const hideSet = new Set(config.hideLabels.map((l) => l.toLowerCase()))
      const found: BoardIssue[] = result.value.issues.map((issue) => {
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
      const foundKeys = new Set(found.map((i) => i.key))
      const missing = requested.filter((k) => !foundKeys.has(k))
      return { ok: true, baseUrl: config.baseUrl, found, missing }
    },
  }
}
