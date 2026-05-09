import { normalizeStatus } from './status'

export type Column = 'TO DO' | 'In Implementation' | 'In Code Review' | 'Done'

export const COLUMNS: readonly Column[] = [
  'TO DO',
  'In Implementation',
  'In Code Review',
  'Done',
] as const

const COLUMN_TO_STATUSES: Record<Column, readonly string[]> = {
  'TO DO': ['Reviewed', 'Blocked'],
  'In Implementation': ['In Implementation'],
  'In Code Review': ['In Code Review'],
  Done: ['In STG', 'In QA', 'In UAT', 'Done'],
}

const STATUS_LOOKUP: ReadonlyMap<string, Column> = new Map(
  (Object.entries(COLUMN_TO_STATUSES) as [Column, readonly string[]][]).flatMap(
    ([column, statuses]) => statuses.map((status) => [normalizeStatus(status), column] as const),
  ),
)

export function columnForStatus(status: string): Column {
  return STATUS_LOOKUP.get(normalizeStatus(status)) ?? 'TO DO'
}

export function statusesForColumn(column: Column): readonly string[] {
  return COLUMN_TO_STATUSES[column]
}

type Deemphasizable = { statusName: string }

const FULL_OPACITY_STATUSES_BY_COLUMN: Partial<Record<Column, ReadonlySet<string>>> = {
  'TO DO': new Set(['reviewed', 'needs review']),
}

export function isDeemphasized(issue: Deemphasizable, column: Column): boolean {
  const fullOpacity = FULL_OPACITY_STATUSES_BY_COLUMN[column]
  if (fullOpacity === undefined) return false
  return !fullOpacity.has(normalizeStatus(issue.statusName))
}
