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
    ([column, statuses]) => statuses.map((status) => [status.toLowerCase(), column] as const),
  ),
)

export function columnForStatus(status: string): Column {
  return STATUS_LOOKUP.get(status.toLowerCase()) ?? 'TO DO'
}

export function statusesForColumn(column: Column): readonly string[] {
  return COLUMN_TO_STATUSES[column]
}
