import type { BoardIssue } from '~/server/jira'
import type { Column } from './status-mapping'

type Sortable = Pick<BoardIssue, 'statusName'>

const TODO_TIER_ORDER: readonly string[] = ['reviewed']
const DONE_STATUS_ORDER: readonly string[] = ['in stg', 'in qa', 'in uat', 'done']

function tierIndex(status: string, order: readonly string[]): number {
  const idx = order.indexOf(status.toLowerCase())
  return idx === -1 ? order.length : idx
}

export function sortColumnIssues<T extends Sortable>(
  issues: readonly T[],
  column: Column,
): readonly T[] {
  if (column === 'TO DO') {
    return issues.toSorted(
      (a, b) =>
        tierIndex(a.statusName, TODO_TIER_ORDER) - tierIndex(b.statusName, TODO_TIER_ORDER),
    )
  }
  if (column === 'Done') {
    return issues.toSorted(
      (a, b) =>
        tierIndex(a.statusName, DONE_STATUS_ORDER) - tierIndex(b.statusName, DONE_STATUS_ORDER),
    )
  }
  return issues
}
