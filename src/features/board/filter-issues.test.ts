import { describe, expect, it } from 'vitest'
import type { BoardIssue } from '~/server/jira'
import { filterIssues } from './filter-issues'

function issue(key: string, summary: string): BoardIssue {
  return { key, summary, statusName: 'Reviewed', typeName: 'Task', labels: [], epic: null }
}

const issues: readonly BoardIssue[] = [
  issue('HDR-1', 'Add login flow'),
  issue('HDR-2', 'Refactor auth middleware'),
  issue('HDR-3', 'Fix bug in checkout'),
  issue('PLAT-10', 'Login screen redesign'),
]

describe('filterIssues', () => {
  it('returns all issues for an empty query', () => {
    expect(filterIssues(issues, '')).toBe(issues)
  })

  it('returns all issues for a whitespace-only query', () => {
    expect(filterIssues(issues, '   ')).toBe(issues)
  })

  it('matches on exact key', () => {
    expect(filterIssues(issues, 'HDR-2').map((i) => i.key)).toEqual(['HDR-2'])
  })

  it('matches partial title', () => {
    expect(filterIssues(issues, 'login').map((i) => i.key)).toEqual(['HDR-1', 'PLAT-10'])
  })

  it('is case-insensitive on both query and content', () => {
    expect(filterIssues(issues, 'LOGIN').map((i) => i.key)).toEqual(['HDR-1', 'PLAT-10'])
    expect(filterIssues(issues, 'hdr-1').map((i) => i.key)).toEqual(['HDR-1'])
  })

  it('requires every whitespace-separated term to match (AND)', () => {
    expect(filterIssues(issues, 'login flow').map((i) => i.key)).toEqual(['HDR-1'])
    expect(filterIssues(issues, 'login redesign').map((i) => i.key)).toEqual(['PLAT-10'])
    expect(filterIssues(issues, 'login bogus')).toEqual([])
  })

  it('matches a term against key and another against summary', () => {
    expect(filterIssues(issues, 'HDR auth').map((i) => i.key)).toEqual(['HDR-2'])
  })

  it('trims leading/trailing whitespace and collapses internal whitespace', () => {
    expect(filterIssues(issues, '  login   flow  ').map((i) => i.key)).toEqual(['HDR-1'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterIssues(issues, 'nonexistent')).toEqual([])
  })
})
