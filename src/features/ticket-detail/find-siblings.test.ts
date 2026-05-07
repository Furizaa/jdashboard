import { describe, expect, it } from 'vitest'
import type { BoardIssue } from '~/server/jira'
import { findSiblings } from './find-siblings'

function issue(key: string, statusName: string): BoardIssue {
  return {
    key,
    summary: `Summary ${key}`,
    statusName,
    typeName: 'Task',
    labels: [],
    epic: null,
  }
}

describe('findSiblings', () => {
  it('returns both null on an empty board', () => {
    expect(findSiblings('A-1', 'Reviewed', [])).toEqual({
      prevKey: null,
      nextKey: null,
    })
  })

  it('returns both null when issue is not present in the board', () => {
    const board = [issue('A-1', 'Reviewed'), issue('A-2', 'Reviewed')]
    expect(findSiblings('A-99', 'Reviewed', board)).toEqual({
      prevKey: null,
      nextKey: null,
    })
  })

  it('returns both null when the issue is the only one in its column', () => {
    const board = [
      issue('A-1', 'Reviewed'),
      issue('A-2', 'In Implementation'),
      issue('A-3', 'In Code Review'),
    ]
    expect(findSiblings('A-1', 'Reviewed', board)).toEqual({
      prevKey: null,
      nextKey: null,
    })
  })

  it('returns null prev and the second key when the issue is first in the column', () => {
    const board = [issue('A-1', 'Reviewed'), issue('A-2', 'Reviewed'), issue('A-3', 'Reviewed')]
    expect(findSiblings('A-1', 'Reviewed', board)).toEqual({
      prevKey: null,
      nextKey: 'A-2',
    })
  })

  it('returns the second-to-last key as prev and null next when the issue is last', () => {
    const board = [issue('A-1', 'Reviewed'), issue('A-2', 'Reviewed'), issue('A-3', 'Reviewed')]
    expect(findSiblings('A-3', 'Reviewed', board)).toEqual({
      prevKey: 'A-2',
      nextKey: null,
    })
  })

  it('skips other-column issues so neighbors come from the same column only', () => {
    const board = [issue('A-1', 'Done'), issue('A-2', 'In Implementation'), issue('A-3', 'Done')]
    expect(findSiblings('A-1', 'Done', board)).toEqual({
      prevKey: null,
      nextKey: 'A-3',
    })
  })

  it('treats statuses with different casing as siblings (column lookup is case-insensitive)', () => {
    const board = [issue('A-1', 'In STG'), issue('A-2', 'IN STG')]
    expect(findSiblings('A-1', 'In STG', board)).toEqual({
      prevKey: null,
      nextKey: 'A-2',
    })
  })
})
