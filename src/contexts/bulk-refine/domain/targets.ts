import type { BoardIssue } from '~/kernel'

// A ticket the transcript router may target: the key plus the signal that lets
// the agent recognise it from a topic ("the login timeout thing", "the user
// groups work") without the transcript ever naming the key — the summary, the
// epic name, and the labels. Structurally a server `RouteTicket`.
export type RefineTarget = {
  readonly key: string
  readonly summary: string
  readonly epic: string | null
  readonly labels: readonly string[]
}

function toTarget(issue: BoardIssue): RefineTarget {
  return {
    key: issue.key,
    summary: issue.summary,
    epic: issue.epic?.summary ?? null,
    labels: issue.labels,
  }
}

// The set of tickets "on the current board" for bulk refine: every board issue
// plus every watchlist card, de-duplicated by key. A ticket that is both on the
// board and watchlisted appears once; the board copy wins (it is offered first).
// Both inputs are the same `BoardIssue` shape and may be undefined while their
// queries load.
export function bulkRefineTargets(
  boardIssues: readonly BoardIssue[] | undefined,
  watchlistCards: readonly BoardIssue[] | undefined,
): RefineTarget[] {
  const byKey = new Map<string, RefineTarget>()
  for (const issue of boardIssues ?? []) {
    if (!byKey.has(issue.key)) byKey.set(issue.key, toTarget(issue))
  }
  for (const card of watchlistCards ?? []) {
    if (!byKey.has(card.key)) byKey.set(card.key, toTarget(card))
  }
  return [...byKey.values()]
}
