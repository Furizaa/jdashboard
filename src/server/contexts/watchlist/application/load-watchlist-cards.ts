import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import type { BoardIssue, RawIssue } from '../../../gateways/jira/types'
import type { JiraUnauthorized } from '../../../gateways/jira/errors'
import { dieOn } from '../../../lib/die-on'
import { WatchlistConfig } from '../config'
import { buildKeysInJql } from '../domain/candidate-jql'

export type LoadWatchlistCardsOk = {
  readonly baseUrl: string
  readonly cards: readonly BoardIssue[]
}

// Same field set as the board so watchlist cards render identically (epic chip,
// labels, fixasap ribbon).
const WATCHLIST_FIELDS = ['summary', 'status', 'labels', 'issuetype', 'parent'] as const

// A local copy of board's `toBoardIssue` — the dependency law forbids importing
// across server contexts. Small enough that duplication beats a shared move.
function toWatchlistCard(issue: RawIssue, hideSet: ReadonlySet<string>): BoardIssue {
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

export function loadWatchlistCards(
  keys: readonly string[],
): Effect.Effect<LoadWatchlistCardsOk, JiraUnauthorized, JiraGateway | WatchlistConfig> {
  return Effect.gen(function* () {
    const config = yield* WatchlistConfig
    if (keys.length === 0) return { baseUrl: config.baseUrl, cards: [] }
    const jira = yield* JiraGateway
    const response = yield* jira
      .searchIssues(buildKeysInJql(keys), WATCHLIST_FIELDS)
      .pipe(dieOn('NotFound', 'Rejected', 'TransportError'))
    const hideSet = new Set(config.hideLabels.map((l) => l.toLowerCase()))
    return {
      baseUrl: config.baseUrl,
      cards: response.issues.map((issue) => toWatchlistCard(issue, hideSet)),
    }
  })
}
