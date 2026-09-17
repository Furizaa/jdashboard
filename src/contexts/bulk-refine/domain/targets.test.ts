import { describe, expect, it } from 'vitest'
import type { BoardIssue } from '~/kernel'
import { bulkRefineTargets } from './targets'

const issue = (key: string, summary: string, over: Partial<BoardIssue> = {}): BoardIssue => ({
  key,
  summary,
  statusName: 'To Do',
  typeName: 'Task',
  labels: [],
  epic: null,
  ...over,
})

describe('bulkRefineTargets', () => {
  it('merges board issues and watchlist cards, carrying epic name and labels as match signal', () => {
    const targets = bulkRefineTargets(
      [
        issue('HDR-1', 'Login timeout', {
          epic: { key: 'HDR-100', summary: 'Auth' },
          labels: ['fe'],
        }),
      ],
      [issue('HDR-2', 'Cache layer')],
    )
    expect(targets).toEqual([
      { key: 'HDR-1', summary: 'Login timeout', epic: 'Auth', labels: ['fe'] },
      { key: 'HDR-2', summary: 'Cache layer', epic: null, labels: [] },
    ])
  })

  it('de-duplicates by key, keeping the board copy', () => {
    const targets = bulkRefineTargets(
      [issue('HDR-1', 'Board summary')],
      [issue('HDR-1', 'Watchlist summary')],
    )
    expect(targets).toEqual([{ key: 'HDR-1', summary: 'Board summary', epic: null, labels: [] }])
  })

  it('treats undefined inputs (queries still loading) as empty', () => {
    expect(bulkRefineTargets(undefined, undefined)).toEqual([])
    expect(bulkRefineTargets(undefined, [issue('HDR-9', 'only watchlist')])).toEqual([
      { key: 'HDR-9', summary: 'only watchlist', epic: null, labels: [] },
    ])
  })
})
