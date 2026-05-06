import type { BoardIssue } from '~/server/jira'
import type { Column } from './status-mapping'

type Deemphasizable = Pick<BoardIssue, 'statusName'>

export function isDeemphasized(issue: Deemphasizable, column: Column): boolean {
  return column === 'TO DO' && issue.statusName.toLowerCase() !== 'reviewed'
}
