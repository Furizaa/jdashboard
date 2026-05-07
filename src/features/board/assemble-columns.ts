import type { BoardIssue } from '~/server/jira'
import type { TicketCardAnimationState } from '~/features/ticket-card'
import { COLUMNS, columnForStatus, type Column } from './status-mapping'
import { filterIssues } from './filter-issues'
import { sortColumnIssues } from './sort-column'
import type { LeavingIssue } from './use-change-indication'

export type ColumnItem = {
  issue: BoardIssue | LeavingIssue
  state: TicketCardAnimationState
}

export function assembleColumns(input: {
  liveIssues: readonly BoardIssue[]
  leaving: ReadonlyMap<string, LeavingIssue>
  enteringKeys: ReadonlySet<string>
  changedKeys: ReadonlySet<string>
  searchQuery: string
}): Record<Column, ColumnItem[]> {
  const { liveIssues, leaving, enteringKeys, changedKeys, searchQuery } = input
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
    result[columnForStatus(issue.statusName)].push({ issue, state })
  }
  for (const leavingIssue of filterIssues([...leaving.values()], searchQuery)) {
    result[leavingIssue.column].push({ issue: leavingIssue, state: 'leaving' })
  }
  for (const column of COLUMNS) {
    const items = result[column]
    // Preserve animation state across sort: per-column sort can reorder by
    // status tier (Done) and we must not flip 'changed' onto the wrong card.
    const stateByKey = new Map(items.map((item) => [item.issue.key, item.state]))
    const sortedIssues = sortColumnIssues(
      items.map((item) => item.issue),
      column,
    )
    result[column] = sortedIssues.map((issue) => ({
      issue,
      state: stateByKey.get(issue.key)!,
    }))
  }
  return result
}
