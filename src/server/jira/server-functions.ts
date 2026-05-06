import { createServerFn } from '@tanstack/react-start'
import { jiraClient, JiraAuthError } from './client'
import { buildBoardJql } from './jql'
import { getServerEnv } from '~/server/env'

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
