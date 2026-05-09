import { match } from 'ts-pattern'
import type { Column } from '~/kernel'
import { normalizeStatus } from '~/kernel'

type Sortable = { statusName: string }

const TODO_TIER_ORDER: readonly string[] = [
  'needs review',
  'reviewed',
  'review rejected',
  'blocked',
]
const DONE_STATUS_ORDER: readonly string[] = [
  'in stg',
  'in qa',
  'in uat',
  'done',
  'review accepted',
]

function tierIndex(status: string, order: readonly string[]): number {
  const idx = order.indexOf(normalizeStatus(status))
  return idx === -1 ? order.length : idx
}

export function sortColumnIssues<T extends Sortable>(
  issues: readonly T[],
  column: Column,
): readonly T[] {
  return match(column)
    .with('TO DO', () =>
      issues.toSorted(
        (a, b) =>
          tierIndex(a.statusName, TODO_TIER_ORDER) - tierIndex(b.statusName, TODO_TIER_ORDER),
      ),
    )
    .with('Done', () =>
      issues.toSorted(
        (a, b) =>
          tierIndex(a.statusName, DONE_STATUS_ORDER) - tierIndex(b.statusName, DONE_STATUS_ORDER),
      ),
    )
    .with('In Implementation', 'In Code Review', () => issues)
    .exhaustive()
}
