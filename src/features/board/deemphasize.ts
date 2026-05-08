import type { BoardIssue } from '~/server/jira'
import type { Column } from './status-mapping'

type Deemphasizable = Pick<BoardIssue, 'statusName'>

const FULL_OPACITY_STATUSES_BY_COLUMN: Partial<Record<Column, ReadonlySet<string>>> = {
  'TO DO': new Set(['reviewed', 'needs review']),
}

export function isDeemphasized(issue: Deemphasizable, column: Column): boolean {
  const fullOpacity = FULL_OPACITY_STATUSES_BY_COLUMN[column]
  if (fullOpacity === undefined) return false
  return !fullOpacity.has(issue.statusName.toLowerCase())
}
