import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { EpicRef } from '../../../gateways/jira/types'
import { CaptureConfig } from '../config'
import type { LoadMyEpicsError } from '../errors'
import { dieOn } from '../../../lib/die-on'
import { quoteJqlString } from '../../../lib/jql'

export type LoadMyEpicsOk = {
  readonly epics: readonly EpicRef[]
}

const EPIC_FIELDS = ['summary'] as const

// statusCategory (not status name) because HDR's Epic workflow uses
// idiosyncratic, mixed-case statuses (IN IMPLEMENTATION, IN CODE REVIEW, ...)
// that don't reliably enumerate.
function buildEpicJql(input: { projectKey: string }): string {
  return [
    `issuetype = Epic`,
    `assignee = currentUser()`,
    `statusCategory != Done`,
    `project = ${quoteJqlString(input.projectKey)}`,
  ].join(' AND ')
}

export const loadMyEpics: Effect.Effect<
  LoadMyEpicsOk,
  LoadMyEpicsError,
  JiraGateway | CaptureConfig
> = Effect.gen(function* () {
  const jira = yield* JiraGateway
  const config = yield* CaptureConfig
  const jql = buildEpicJql({ projectKey: config.projectKey })
  const response = yield* jira
    .searchIssues(jql, EPIC_FIELDS)
    .pipe(dieOn('NotFound', 'Rejected', 'TransportError'))
  const epics: EpicRef[] = response.issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary,
  }))
  return { epics }
})
