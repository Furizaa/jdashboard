import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { BoardIssue, RawIssue } from '../../../gateways/jira/types'
import { BoardConfig } from '../config'
import type { JiraUnauthorized } from '../../../gateways/jira/errors'
import { quoteJqlString } from '../../../lib/jql'

export type LoadBoardOk = {
  readonly baseUrl: string
  readonly issues: readonly BoardIssue[]
}

const BOARD_FIELDS = ['summary', 'status', 'labels', 'issuetype', 'parent'] as const

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

function toBoardIssue(issue: RawIssue, hideSet: ReadonlySet<string>): BoardIssue {
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
}

export const loadBoard: Effect.Effect<LoadBoardOk, JiraUnauthorized, JiraGateway | BoardConfig> =
  Effect.gen(function* () {
    const jira = yield* JiraGateway
    const config = yield* BoardConfig
    const jql = buildBoardJql({
      projectKey: config.projectKey,
      label: config.labelFilter,
      doneWindowDays: config.doneWindowDays,
    })
    const response = yield* jira.searchIssues(jql, BOARD_FIELDS).pipe(
      Effect.catchTags({
        NotFound: (e) => Effect.die(e),
        Rejected: (e) => Effect.die(e),
      }),
    )
    const hideSet = new Set(config.hideLabels.map((l) => l.toLowerCase()))
    const issues = response.issues.map((issue) => toBoardIssue(issue, hideSet))
    return { baseUrl: config.baseUrl, issues }
  })
