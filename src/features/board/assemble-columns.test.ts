import { describe, expect, it } from 'vitest'
import type { BoardIssue } from '~/server/jira'
import { assembleColumns } from './assemble-columns'
import type { LeavingIssue } from './use-change-indication'

function issue(key: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    key,
    summary: key,
    statusName: 'Reviewed',
    typeName: 'Task',
    labels: [],
    epic: null,
    ...overrides,
  }
}

function leavingIssue(
  key: string,
  column: LeavingIssue['column'],
  overrides: Partial<BoardIssue> = {},
): LeavingIssue {
  return { ...issue(key, overrides), column }
}

const NO_LEAVING: ReadonlyMap<string, LeavingIssue> = new Map()
const NO_KEYS: ReadonlySet<string> = new Set()

describe('assembleColumns', () => {
  it('returns four empty columns when there are no live or leaving issues', () => {
    const result = assembleColumns({
      liveIssues: [],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result['TO DO']).toEqual([])
    expect(result['In Implementation']).toEqual([])
    expect(result['In Code Review']).toEqual([])
    expect(result.Done).toEqual([])
  })

  it('places one issue per column with state idle when nothing is entering or changed', () => {
    const result = assembleColumns({
      liveIssues: [
        issue('A-1', { statusName: 'Reviewed' }),
        issue('A-2', { statusName: 'In Implementation' }),
        issue('A-3', { statusName: 'In Code Review' }),
        issue('A-4', { statusName: 'Done' }),
      ],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result['TO DO']).toEqual([
      { issue: expect.objectContaining({ key: 'A-1' }), state: 'idle' },
    ])
    expect(result['In Implementation']).toEqual([
      { issue: expect.objectContaining({ key: 'A-2' }), state: 'idle' },
    ])
    expect(result['In Code Review']).toEqual([
      { issue: expect.objectContaining({ key: 'A-3' }), state: 'idle' },
    ])
    expect(result.Done).toEqual([{ issue: expect.objectContaining({ key: 'A-4' }), state: 'idle' }])
  })

  it('marks an issue in enteringKeys as entering', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      leaving: NO_LEAVING,
      enteringKeys: new Set(['A-1']),
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('entering')
  })

  it('marks an issue in changedKeys as changed', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: new Set(['A-1']),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('changed')
  })

  it("when an issue is in both enteringKeys and changedKeys, 'entering' wins", () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      leaving: NO_LEAVING,
      enteringKeys: new Set(['A-1']),
      changedKeys: new Set(['A-1']),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('entering')
  })

  it('appends a leaving issue to its frozen column, not its current statusName column', () => {
    const leaving = new Map<string, LeavingIssue>([
      // Issue's statusName says Reviewed (TO DO column) but its frozen column is Done.
      ['A-1', leavingIssue('A-1', 'Done', { statusName: 'Reviewed' })],
    ])
    const result = assembleColumns({
      liveIssues: [],
      leaving,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result['TO DO']).toEqual([])
    expect(result.Done).toEqual([
      { issue: expect.objectContaining({ key: 'A-1' }), state: 'leaving' },
    ])
  })

  it('searchQuery filters live issues', () => {
    const result = assembleColumns({
      liveIssues: [
        issue('A-1', { summary: 'Add login flow' }),
        issue('A-2', { summary: 'Refactor auth' }),
      ],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: 'login',
    })
    expect(result['TO DO'].map((item) => item.issue.key)).toEqual(['A-1'])
  })

  it('searchQuery filters leaving issues', () => {
    const leaving = new Map<string, LeavingIssue>([
      ['A-1', leavingIssue('A-1', 'TO DO', { summary: 'Add login flow' })],
      ['A-2', leavingIssue('A-2', 'TO DO', { summary: 'Refactor auth' })],
    ])
    const result = assembleColumns({
      liveIssues: [],
      leaving,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: 'login',
    })
    expect(result['TO DO'].map((item) => item.issue.key)).toEqual(['A-1'])
  })

  it('preserves animation state across the Done-column sort', () => {
    // sortColumnIssues for Done sorts by tier: STG → QA → UAT → Done.
    // Input order is intentionally inverse, so sort moves things around.
    const liveIssues = [
      issue('A-1', { statusName: 'Done' }),
      issue('A-2', { statusName: 'In STG' }),
      issue('A-3', { statusName: 'In QA' }),
    ]
    const result = assembleColumns({
      liveIssues,
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: new Set(['A-2']),
      searchQuery: '',
    })
    expect(result.Done.map((item) => item.issue.key)).toEqual(['A-2', 'A-3', 'A-1'])
    expect(result.Done.map((item) => item.state)).toEqual(['changed', 'idle', 'idle'])
  })

  it('places HDR-cased status names into the same column as Title-cased equivalents', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1', { statusName: 'IN STG' }), issue('A-2', { statusName: 'In STG' })],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result.Done.map((item) => item.issue.key).toSorted()).toEqual(['A-1', 'A-2'])
  })
})
