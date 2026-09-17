import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { JiraUnauthorized } from '../../../gateways/jira/errors'
import { dieOn } from '../../../lib/die-on'
import { WatchlistConfig } from '../config'
import { buildCandidateJql } from '../domain/candidate-jql'

// A lightweight ticket reference shown as a search-result row in the add-modal.
// Deliberately smaller than BoardIssue — enough to identify and confirm a pick.
export type WatchlistCandidate = {
  readonly key: string
  readonly summary: string
  readonly statusName: string
  readonly typeName: string
}

export type SearchCandidatesOk = {
  readonly baseUrl: string
  readonly candidates: readonly WatchlistCandidate[]
}

const CANDIDATE_FIELDS = ['summary', 'status', 'issuetype'] as const

export function searchCandidates(
  text: string,
): Effect.Effect<SearchCandidatesOk, JiraUnauthorized, JiraGateway | WatchlistConfig> {
  return Effect.gen(function* () {
    const config = yield* WatchlistConfig
    const trimmed = text.trim()
    if (trimmed === '') return { baseUrl: config.baseUrl, candidates: [] }
    const jira = yield* JiraGateway
    const response = yield* jira
      .searchIssues(buildCandidateJql(trimmed), CANDIDATE_FIELDS)
      .pipe(dieOn('NotFound', 'Rejected', 'TransportError'))
    return {
      baseUrl: config.baseUrl,
      candidates: response.issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
        statusName: issue.fields.status.name,
        typeName: issue.fields.issuetype?.name ?? 'Task',
      })),
    }
  })
}
