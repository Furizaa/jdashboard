import { describe, expect, it } from 'vitest'
import type { GanttNode } from '~/kernel'
import { buildTree, visibleRows, type GanttTreeNode } from './tree'

// Table-driven over the two things that reach this module and cannot be
// validated away upstream: a `parentId` naming a node that is not in the chart,
// and a `parentId` cycle. `gantt-schema.ts` deliberately does not check either
// (placement is this module's concern), so both are cases rather than
// impossibilities — and the claim worth testing hardest is that **nothing is
// ever dropped**.

function node(id: string, overrides: Partial<GanttNode> = {}): GanttNode {
  return {
    id,
    parentId: null,
    order: 0,
    title: id,
    source: { kind: 'local' },
    start: null,
    end: null,
    column: 'TO DO',
    status: null,
    assignee: null,
    orphaned: false,
    ...overrides,
  }
}

/** Every id in the tree, so "nothing was dropped" is one assertion. */
function idsIn(roots: readonly GanttTreeNode[]): string[] {
  return roots.flatMap((root) => [root.node.id, ...idsIn(root.children)])
}

describe('buildTree', () => {
  it('nests three deep', () => {
    const tree = buildTree([
      node('prd'),
      node('feature', { parentId: 'prd' }),
      node('task', { parentId: 'feature' }),
    ])

    expect(tree.roots.map((root) => root.node.id)).toEqual(['prd'])
    expect(tree.roots[0]?.children[0]?.node.id).toBe('feature')
    expect(tree.roots[0]?.children[0]?.children[0]?.node.id).toBe('task')
    expect(tree.parentOf.get('task')).toBe('feature')
    expect(tree.byId.size).toBe(3)
  })

  it('re-roots a node whose parentId names a node that is not in the chart', () => {
    const tree = buildTree([node('prd'), node('stray', { parentId: 'ghost' })])

    // Re-rooted, not dropped: it keeps its body, its dates and its children.
    expect(idsIn(tree.roots)).toEqual(['prd', 'stray'])
    expect(tree.parentOf.get('stray')).toBeNull()
    expect([...tree.reRooted]).toEqual(['stray'])
  })

  it('keeps the children of a re-rooted node under it', () => {
    const tree = buildTree([
      node('stray', { parentId: 'ghost' }),
      node('child', { parentId: 'stray' }),
    ])

    expect(tree.roots.map((root) => root.node.id)).toEqual(['stray'])
    expect(tree.roots[0]?.children.map((child) => child.node.id)).toEqual(['child'])
  })

  it.each([
    ['a two-node cycle', [node('a', { parentId: 'b' }), node('b', { parentId: 'a' })], ['a', 'b']],
    [
      'a three-node cycle',
      [node('a', { parentId: 'b' }), node('b', { parentId: 'c' }), node('c', { parentId: 'a' })],
      ['a', 'b', 'c'],
    ],
    ['a node that is its own parent', [node('a', { parentId: 'a' })], ['a']],
    [
      'two overlapping cycles',
      [
        node('a', { parentId: 'b' }),
        node('b', { parentId: 'c' }),
        node('c', { parentId: 'a' }),
        node('d', { parentId: 'b' }),
        node('e', { parentId: 'd' }),
      ],
      ['a', 'b', 'c', 'd', 'e'],
    ],
  ])('breaks %s rather than recursing forever', (_name, nodes, expected) => {
    const tree = buildTree(nodes)

    expect(idsIn(tree.roots).toSorted()).toEqual(expected)
    expect(tree.cycleBroken.size).toBeGreaterThan(0)
  })

  it('orders siblings by order, then by id', () => {
    const tree = buildTree([
      node('prd'),
      node('later', { parentId: 'prd', order: 2 }),
      node('zebra', { parentId: 'prd', order: 1 }),
      node('apple', { parentId: 'prd', order: 1 }),
    ])

    expect(tree.roots[0]?.children.map((child) => child.node.id)).toEqual([
      'apple',
      'zebra',
      'later',
    ])
  })

  it('orders roots the same way', () => {
    const tree = buildTree([
      node('b', { order: 1 }),
      node('a', { order: 1 }),
      node('c', { order: 0 }),
    ])

    expect(tree.roots.map((root) => root.node.id)).toEqual(['c', 'a', 'b'])
  })

  it('is empty for an empty chart', () => {
    expect(buildTree([])).toMatchObject({ roots: [] })
  })
})

describe('visibleRows', () => {
  const tree = buildTree([
    node('prd', { order: 0 }),
    node('feature', { parentId: 'prd' }),
    node('task', { parentId: 'feature' }),
    node('other', { order: 1 }),
  ])

  it('returns every row, in reading order, with its depth', () => {
    expect(visibleRows(tree, new Set()).map((row) => [row.node.id, row.depth])).toEqual([
      ['prd', 0],
      ['feature', 1],
      ['task', 2],
      ['other', 0],
    ])
  })

  it('keeps a collapsed row and drops everything under it', () => {
    const rows = visibleRows(tree, new Set(['feature']))

    expect(rows.map((row) => row.node.id)).toEqual(['prd', 'feature', 'other'])
    expect(rows.find((row) => row.node.id === 'feature')).toMatchObject({
      collapsed: true,
      hasChildren: true,
      depth: 1,
    })
  })

  it('drops a whole subtree when the root of it is collapsed', () => {
    expect(visibleRows(tree, new Set(['prd'])).map((row) => row.node.id)).toEqual(['prd', 'other'])
  })

  it('collapsing a leaf changes nothing but the leaf flag', () => {
    const rows = visibleRows(tree, new Set(['task']))

    expect(rows.map((row) => row.node.id)).toEqual(['prd', 'feature', 'task', 'other'])
    expect(rows.at(-2)).toMatchObject({ hasChildren: false, collapsed: true })
  })
})
