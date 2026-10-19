import { describe, expect, it } from 'vitest'
import type { GanttChart, GanttEdge, GanttNode } from '~/kernel'
import { findCycles } from './cycles'

// The four shapes that hang a naive walker — a 2-cycle, a 3-cycle, a self-edge
// and two overlapping cycles — each with a timeout, because "terminates" is the
// claim and a test that hangs is a test that reported nothing.

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

/** `a>b` reads "a blocks b", and the edge is named `a-b`. */
function edge(spec: string): GanttEdge {
  const [from = '', to = ''] = spec.split('>')
  return { id: `${from}-${to}`, from, to, source: { kind: 'local' } }
}

function chart(edgeSpecs: readonly string[], ids?: readonly string[]): GanttChart {
  const edges = edgeSpecs.map(edge)
  const nodeIds = ids ?? [...new Set(edges.flatMap((e) => [e.from, e.to]))]
  return {
    version: 1,
    id: 'chart',
    title: 'Chart',
    jiraSources: [],
    lastSyncedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    nodes: nodeIds.map((id) => node(id)),
    edges,
  }
}

/** A cycle is reported from wherever the walk entered it, so compare as a set. */
function loopsIn(chartValue: GanttChart): string[][] {
  return findCycles(chartValue).cycles.map((cycle) => [...cycle.nodeIds].toSorted())
}

describe('findCycles', () => {
  it('finds nothing in a chart with no edges', () => {
    expect(findCycles(chart([], ['a', 'b']))).toMatchObject({ cycles: [] })
  })

  it('finds nothing in a chart that is a DAG, however tangled', () => {
    // A diamond and a long chain: plenty of nodes reached twice, no cycle.
    expect(loopsIn(chart(['a>b', 'a>c', 'b>d', 'c>d', 'd>e', 'a>e']))).toEqual([])
  })

  it.each([
    ['a two-cycle', ['a>b', 'b>a'], [['a', 'b']]],
    ['a three-cycle', ['a>b', 'b>c', 'c>a'], [['a', 'b', 'c']]],
    ['a self-edge', ['a>a'], [['a']]],
    [
      'two overlapping cycles sharing a node',
      ['a>b', 'b>a', 'b>c', 'c>b'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    ],
    [
      'a cycle hanging off a DAG, reachable from two roots',
      ['root>a', 'other>a', 'a>b', 'b>a'],
      [['a', 'b']],
    ],
  ])(
    'names %s',
    (_name, edgeSpecs, expected) => {
      expect(loopsIn(chart(edgeSpecs)).toSorted()).toEqual(expected.toSorted())
    },
    1000,
  )

  it('names the loop in order, so the warning can read it as a → b → c → a', () => {
    const { cycles } = findCycles(chart(['a>b', 'b>c', 'c>a']))

    expect(cycles[0]?.nodeIds).toEqual(['a', 'b', 'c'])
    // Not closed: `a` is not repeated at the end.
    expect(cycles[0]?.nodeIds).toHaveLength(3)
  })

  it('reports the edges in the loop, in the same order as the nodes', () => {
    const { cycles, edgeIds } = findCycles(chart(['a>b', 'b>c', 'c>a']))

    expect(cycles[0]?.edgeIds).toEqual(['a-b', 'b-c', 'c-a'])
    expect([...edgeIds].toSorted()).toEqual(['a-b', 'b-c', 'c-a'])
  })

  it('reports a self-edge as a one-node loop carrying that edge', () => {
    const { cycles, nodeIds, edgeIds } = findCycles(chart(['a>a']))

    expect(cycles).toEqual([{ nodeIds: ['a'], edgeIds: ['a-a'] }])
    expect([...nodeIds]).toEqual(['a'])
    expect([...edgeIds]).toEqual(['a-a'])
  })

  it('leaves the edges of an acyclic branch out of the cycle sets', () => {
    const { edgeIds, nodeIds } = findCycles(chart(['root>a', 'a>b', 'b>a']))

    expect([...edgeIds].toSorted()).toEqual(['a-b', 'b-a'])
    expect([...nodeIds].toSorted()).toEqual(['a', 'b'])
  })

  it('terminates on a long cycle rather than recursing per edge', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `n${index}`)
    const edges = ids.map((id, index) => `${id}>${ids[(index + 1) % ids.length] ?? ''}`)

    expect(findCycles(chart(edges, ids)).cycles).toHaveLength(1)
  }, 1000)
})
