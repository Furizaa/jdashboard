import type { BoardIssue } from '~/server/jira'
import type { ReviewCard } from '~/server/gitlab'
import type { TicketCardAnimationState, TicketCardInput } from '~/features/ticket-card'
import { COLUMNS, columnForStatus, type Column } from './status-mapping'
import { filterIssues } from './filter-issues'
import { sortColumnIssues } from './sort-column'
import type { LeavingIssue } from './use-change-indication'

export type ColumnItem = {
  card: TicketCardInput
  /** Stable id for animation/key purposes (Jira key for jira; review:<iid> for review cards). */
  id: string
  state: TicketCardAnimationState
}

function reviewBucketColumn(bucket: ReviewCard['bucket']): Column {
  if (bucket === 'accepted') return 'Done'
  return 'TO DO'
}

function matchesSearch(card: TicketCardInput, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack =
    card.kind === 'jira'
      ? `${card.issue.key} ${card.issue.summary}`.toLowerCase()
      : `${card.card.jira.key} ${card.card.jira.summary}`.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export function assembleColumns(input: {
  liveIssues: readonly BoardIssue[]
  leaving: ReadonlyMap<string, LeavingIssue>
  enteringKeys: ReadonlySet<string>
  changedKeys: ReadonlySet<string>
  reviewCards?: readonly ReviewCard[]
  searchQuery: string
}): Record<Column, ColumnItem[]> {
  const { liveIssues, leaving, enteringKeys, changedKeys, reviewCards, searchQuery } = input
  const result: Record<Column, ColumnItem[]> = {
    'TO DO': [],
    'In Implementation': [],
    'In Code Review': [],
    Done: [],
  }
  for (const issue of filterIssues(liveIssues, searchQuery)) {
    const state: TicketCardAnimationState = enteringKeys.has(issue.key)
      ? 'entering'
      : changedKeys.has(issue.key)
        ? 'changed'
        : 'idle'
    result[columnForStatus(issue.statusName)].push({
      card: { kind: 'jira', issue },
      id: issue.key,
      state,
    })
  }
  for (const leavingIssue of filterIssues([...leaving.values()], searchQuery)) {
    result[leavingIssue.column].push({
      card: { kind: 'jira', issue: leavingIssue },
      id: leavingIssue.key,
      state: 'leaving',
    })
  }
  if (reviewCards !== undefined) {
    for (const rc of reviewCards) {
      if (rc.kind !== 'review-real') continue
      const cardInput: TicketCardInput = { kind: 'review-real', card: rc }
      if (!matchesSearch(cardInput, searchQuery)) continue
      result[reviewBucketColumn(rc.bucket)].push({
        card: cardInput,
        id: `review:${rc.iid}`,
        state: 'idle',
      })
    }
  }
  for (const column of COLUMNS) {
    const items = result[column]
    const stateById = new Map(items.map((item) => [item.id, item.state]))
    const jiraOnly: BoardIssue[] = items
      .filter((item) => item.card.kind === 'jira')
      .map((item) => (item.card as { kind: 'jira'; issue: BoardIssue }).issue)
    const sortedJira = sortColumnIssues(jiraOnly, column)
    const reviewOnly = items.filter((item) => item.card.kind === 'review-real')
    const sortedJiraItems: ColumnItem[] = sortedJira.map((issue) => ({
      card: { kind: 'jira', issue },
      id: issue.key,
      state: stateById.get(issue.key)!,
    }))
    result[column] = [...sortedJiraItems, ...reviewOnly]
  }
  return result
}
