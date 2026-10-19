import { describe, expect, it } from 'vitest'
import type { Column, GanttNode } from '~/kernel'
import { progressFor } from './progress'
import { buildTree } from './tree'

// The rollup the chart was opened for. Two claims carry it: **leaves only**, so
// one piece of work described at two altitudes is counted once; and a childless
// node is **its own** distribution, so an undecomposed PRD is not reported as
// finished.

function node(id: string, column: Column, parentId: string | null = null): GanttNode {
  return {
    id,
    parentId,
    order: 0,
    title: id,
    source: { kind: 'local' },
    start: null,
    end: null,
    column,
    status: null,
    assignee: null,
    orphaned: false,
  }
}

/**
 * One PRD, three features, eleven leaves, seven of them Done — the shape the
 * acceptance criterion names.
 */
const ELEVEN_LEAVES: readonly GanttNode[] = [
  node('prd', 'In Implementation'),
  node('f1', 'In Implementation', 'prd'),
  node('f2', 'In Implementation', 'prd'),
  node('f3', 'TO DO', 'prd'),
  ...(['Done', 'Done', 'Done', 'TO DO'] as const).map((column, index) =>
    node(`f1-t${index}`, column, 'f1'),
  ),
  ...(['Done', 'Done', 'Done', 'In Code Review'] as const).map((column, index) =>
    node(`f2-t${index}`, column, 'f2'),
  ),
  ...(['Done', 'TO DO', 'TO DO'] as const).map((column, index) =>
    node(`f3-t${index}`, column, 'f3'),
  ),
]

describe('progressFor', () => {
  const progress = progressFor(buildTree(ELEVEN_LEAVES))

  it('rolls the whole chart up to 7 of 11', () => {
    expect(progress.get('prd')).toMatchObject({ done: 7, total: 11 })
  })

  it('counts leaf descendants only, never the lanes in between', () => {
    // 11 leaves and 3 intermediate features: counting both would say 14.
    expect(progress.get('prd')?.total).toBe(11)
    expect(progress.get('prd')?.distribution).toEqual({
      'TO DO': 3,
      'In Implementation': 0,
      'In Code Review': 1,
      Done: 7,
    })
  })

  it('ignores the parent lane’s own column', () => {
    // `prd` is In Implementation and no leaf is: the rollup is about the leaves.
    expect(progress.get('prd')?.distribution['In Implementation']).toBe(0)
  })

  it.each([
    ['f1', 3, 4],
    ['f2', 3, 4],
    ['f3', 1, 3],
  ])('rolls %s up to %i of %i', (id, done, total) => {
    expect(progress.get(id)).toMatchObject({ done, total })
  })

  it('treats a childless node as its own distribution', () => {
    expect(progress.get('f1-t0')).toMatchObject({ done: 1, total: 1 })
    expect(progress.get('f1-t3')).toMatchObject({ done: 0, total: 1 })
  })

  it('reports an undecomposed PRD as 0 of 1, not as finished', () => {
    const lonely = progressFor(buildTree([node('prd', 'TO DO')]))

    expect(lonely.get('prd')).toMatchObject({ done: 0, total: 1 })
  })

  it('answers for every node in the tree', () => {
    expect(progress.size).toBe(ELEVEN_LEAVES.length)
  })
})
