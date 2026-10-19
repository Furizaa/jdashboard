import { describe, expect, it } from 'vitest'
import { aChart, anEdge, aNode } from '../application/__fixtures__/fake-gantt-store'
import {
  applyReconciliation,
  countsOf,
  reconcile,
  type DiscoveredIssue,
  type MirroredFields,
  type Reconciliation,
} from './reconcile'

// The invariant this slice exists to protect: **no output of `reconcile` is
// ever a move or a delete of a node.** The first describe block asserts that of
// the *type* — there is no field that could express one — and the rest assert
// the behaviour that follows from it.

function anIssue(key: string, overrides: Partial<DiscoveredIssue> = {}): DiscoveredIssue {
  return {
    key,
    title: `Ticket ${key}`,
    status: 'In Implementation',
    assignee: 'Ada Lovelace',
    parentKey: null,
    links: [],
    ...overrides,
  }
}

/** The usual compile-time equality, so a widened type fails the build. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

describe('reconcile — the return type cannot express a node move or a node delete', () => {
  it('has exactly seven fields, none of which is a removal or a reparent', () => {
    // If a `nodeRemovals` or a `moves` field is ever added, this stops compiling
    // before it stops passing.
    type SevenFields = Expect<
      Equal<
        keyof Reconciliation,
        | 'mirrorUpdates'
        | 'additions'
        | 'orphanedIds'
        | 'discoveredIds'
        | 'edgeAdditions'
        | 'edgeRemovals'
        | 'edgePromotions'
      >
    >
    // A mirror update's payload is the four mirrored fields and nothing else, so
    // `parentId`, `order`, `start` and `end` are not nameable in one.
    type FourMirroredFields = Expect<
      Equal<keyof MirroredFields, 'title' | 'column' | 'status' | 'assignee'>
    >
    type NothingThatMoves = Expect<
      Equal<Extract<keyof MirroredFields, 'id' | 'parentId' | 'order' | 'start' | 'end'>, never>
    >
    const asserted: [SevenFields, FourMirroredFields, NothingThatMoves] = [true, true, true]
    expect(asserted).toEqual([true, true, true])

    // And the same statement at run time, so the shape is pinned for a reader
    // who is not reading the types.
    expect(Object.keys(reconcile(aChart(), [])).toSorted()).toEqual([
      'additions',
      'discoveredIds',
      'edgeAdditions',
      'edgePromotions',
      'edgeRemovals',
      'mirrorUpdates',
      'orphanedIds',
    ])
  })
})

describe('reconcile — mirrored fields', () => {
  const chart = aChart({
    nodes: [
      aNode('geo-120', {
        source: { kind: 'jira', key: 'GEO-120' },
        title: 'Stale title',
        parentId: null,
        order: 3,
        start: '2026-01-01',
        end: '2026-03-31',
        column: 'TO DO',
        status: 'Reviewed',
        assignee: null,
      }),
    ],
  })

  it('carries only title, column, status and assignee', () => {
    const change = reconcile(chart, [anIssue('GEO-120', { title: 'Fresh title' })])
    expect(change.mirrorUpdates).toEqual([
      {
        nodeId: 'geo-120',
        fields: {
          title: 'Fresh title',
          column: 'In Implementation',
          status: 'In Implementation',
          assignee: 'Ada Lovelace',
        },
      },
    ])
  })

  it('leaves start, end, parentId and order untouched when applied', () => {
    const next = applyReconciliation(chart, reconcile(chart, [anIssue('GEO-120')]))
    const node = next.nodes[0]
    expect(node).toMatchObject({
      id: 'geo-120',
      parentId: null,
      order: 3,
      start: '2026-01-01',
      end: '2026-03-31',
    })
    expect(next.nodes).toHaveLength(1)
  })

  it('reports nothing for a node that is already current', () => {
    const current = applyReconciliation(chart, reconcile(chart, [anIssue('GEO-120')]))
    expect(reconcile(current, [anIssue('GEO-120')]).mirrorUpdates).toEqual([])
  })

  it('maps the real HDR status onto a Column and keeps the status name beside it', () => {
    const change = reconcile(chart, [anIssue('GEO-120', { status: 'In STG' })])
    expect(change.mirrorUpdates[0]?.fields).toMatchObject({ column: 'Done', status: 'In STG' })
  })

  it('does not touch a local node, whatever Jira says', () => {
    const local = aChart({ nodes: [aNode('pricing-prd', { title: 'Pricing rework' })] })
    const change = reconcile(local, [anIssue('GEO-120')])
    expect(change.mirrorUpdates).toEqual([])
    expect(change.orphanedIds).toEqual([])
    expect(applyReconciliation(local, change).nodes[0]).toEqual(local.nodes[0])
  })
})

describe('reconcile — placement survives Jira', () => {
  it('keeps a ticket where the chart put it when its Jira parent changed', () => {
    const chart = aChart({
      nodes: [
        aNode('pricing-prd', { title: 'Pricing rework' }),
        aNode('geo-200', {
          source: { kind: 'jira', key: 'GEO-200' },
          parentId: 'pricing-prd',
          order: 1,
          start: '2026-02-01',
          end: '2026-02-14',
        }),
      ],
    })
    const next = applyReconciliation(
      chart,
      reconcile(chart, [anIssue('GEO-200', { parentKey: 'GEO-999' })]),
    )
    expect(next.nodes.find((node) => node.id === 'geo-200')).toMatchObject({
      parentId: 'pricing-prd',
      order: 1,
      start: '2026-02-01',
      end: '2026-02-14',
    })
  })
})

describe('reconcile — departures are marked, never removed', () => {
  const chart = aChart({
    nodes: [
      aNode('geo-300', {
        source: { kind: 'jira', key: 'GEO-300' },
        start: '2026-04-01',
        end: '2026-04-30',
      }),
      aNode('local-child', { parentId: 'geo-300', title: 'A note on the ticket' }),
      aNode('geo-301', { source: { kind: 'jira', key: 'GEO-301' } }),
    ],
    edges: [anEdge('declared', 'local-child', 'geo-301')],
  })

  it('marks the departed ticket and keeps it, its children, its dates and its edges', () => {
    const change = reconcile(chart, [anIssue('GEO-301')])
    expect(change.orphanedIds).toEqual(['geo-300'])

    const next = applyReconciliation(chart, change)
    expect(next.nodes.map((node) => node.id)).toEqual(['geo-300', 'local-child', 'geo-301'])
    expect(next.nodes[0]).toMatchObject({
      orphaned: true,
      start: '2026-04-01',
      end: '2026-04-30',
    })
    expect(next.nodes[1]).toMatchObject({ parentId: 'geo-300', orphaned: false })
    expect(next.edges).toEqual(chart.edges)
  })

  it('un-marks a ticket that came back, because orphanedIds is the set and not the delta', () => {
    const marked = applyReconciliation(chart, reconcile(chart, [anIssue('GEO-301')]))
    const back = applyReconciliation(
      marked,
      reconcile(marked, [anIssue('GEO-300'), anIssue('GEO-301')]),
    )
    expect(back.nodes[0]).toMatchObject({ id: 'geo-300', orphaned: false })
  })
})

// The real release gate for a front-end epic frequently lives in a **different**
// epic, so no discovery search for this chart will ever return it. Orphaning it
// would say it "left the epic", which is a lie, and the workaround — a local lane
// with a hand-copied status — goes stale silently and forever.
describe('reconcile — a node no discovery search has ever returned', () => {
  const blocker = aNode('hdr-19244', {
    source: { kind: 'jira', key: 'HDR-19244' },
    // What `POST /nodes` leaves: a real ticket, never in a search's scope.
    discovered: false,
    title: 'Groups API ships',
    status: 'In Implementation',
    column: 'In Implementation',
  })
  const chart = aChart({
    jiraSources: ['HDR-20708'],
    nodes: [blocker, aNode('hdr-20709', { source: { kind: 'jira', key: 'HDR-20709' } })],
  })

  it('is never orphaned, however complete the search was', () => {
    // A search that returned the chart's other lane and nothing else: authoritative
    // by any measure, and still no evidence at all about this key.
    const change = reconcile(chart, [anIssue('HDR-20709')])
    expect(change.orphanedIds).toEqual([])
    expect(applyReconciliation(chart, change).nodes[0]).toMatchObject({
      id: 'hdr-19244',
      orphaned: false,
      discovered: false,
    })
  })

  it('still has its mirrored half refreshed from a read by key', () => {
    const change = reconcile(
      chart,
      [],
      [anIssue('HDR-19244', { title: 'Groups API ships', status: 'In STG' })],
    )
    const next = applyReconciliation(chart, change)
    expect(next.nodes[0]).toMatchObject({
      id: 'hdr-19244',
      status: 'In STG',
      column: 'Done',
      orphaned: false,
      // A read by key is not a search, so it cannot make a node orphan-eligible.
      discovered: false,
    })
  })

  it('adds no node and no edge from a read by key, whatever that ticket says', () => {
    const change = reconcile(
      chart,
      [],
      [
        anIssue('HDR-19244'),
        // A ticket this chart has never heard of, arriving by key. It must not
        // become a lane: a read by key is not discovery.
        anIssue('HDR-40000'),
      ],
    )
    expect(change.additions).toEqual([])
    expect(change.edgeAdditions).toEqual([])
    expect(change.discoveredIds).toEqual([])
  })

  it('becomes orphan-eligible the first time a search does return its key', () => {
    const found = applyReconciliation(chart, reconcile(chart, [anIssue('HDR-19244')]))
    expect(found.nodes[0]).toMatchObject({ discovered: true, orphaned: false })

    // And from then on it is an ordinary mirrored lane: gone from the search is
    // gone from the epic.
    const gone = applyReconciliation(found, reconcile(found, [anIssue('HDR-20709')]))
    expect(gone.nodes[0]).toMatchObject({ discovered: true, orphaned: true })
  })

  it('never un-discovers a node, because discoveredIds is or-ed and not assigned', () => {
    const found = applyReconciliation(chart, reconcile(chart, [anIssue('HDR-19244')]))
    const later = applyReconciliation(found, reconcile(found, []))
    expect(later.nodes[0]?.discovered).toBe(true)
  })
})

describe('reconcile — newly discovered tickets', () => {
  it('adds them flat and undated, under their Jira parent when it is a node here', () => {
    const chart = aChart({
      nodes: [aNode('geo-120', { source: { kind: 'jira', key: 'GEO-120' }, order: 0 })],
    })
    const change = reconcile(chart, [
      anIssue('GEO-120'),
      anIssue('GEO-121', { parentKey: 'GEO-120' }),
      anIssue('GEO-122', { parentKey: 'GEO-999' }),
    ])
    expect(change.additions).toEqual([
      {
        id: 'geo-121',
        parentId: 'geo-120',
        order: 0,
        title: 'Ticket GEO-121',
        source: { kind: 'jira', key: 'GEO-121' },
        start: null,
        end: null,
        column: 'In Implementation',
        status: 'In Implementation',
        assignee: 'Ada Lovelace',
        // A search is the only thing that can produce an addition, so the flag
        // that records "a search returned this key" is true by construction.
        discovered: true,
        orphaned: false,
      },
      expect.objectContaining({ id: 'geo-122', parentId: null, order: 1 }),
    ])
  })

  it('nests a discovered child under a discovered parent in the same pass', () => {
    const change = reconcile(aChart(), [
      anIssue('GEO-120'),
      anIssue('GEO-121', { parentKey: 'GEO-120' }),
    ])
    expect(change.additions.map((node) => [node.id, node.parentId])).toEqual([
      ['geo-120', null],
      ['geo-121', 'geo-120'],
    ])
  })

  it('orders an addition past the last sibling rather than on top of it', () => {
    const chart = aChart({ nodes: [aNode('prd'), aNode('api', { parentId: 'prd', order: 7 })] })
    const change = reconcile(chart, [anIssue('GEO-5')])
    expect(change.additions[0]).toMatchObject({ parentId: null, order: 1 })
  })
})

describe('reconcile — edges carry their own source', () => {
  const twoTickets = [
    aNode('geo-1', { source: { kind: 'jira', key: 'GEO-1' } }),
    aNode('geo-2', { source: { kind: 'jira', key: 'GEO-2' } }),
  ]
  const blocks = (linkId: string) => ({
    linkId,
    blockerKey: 'GEO-1',
    blockedKey: 'GEO-2',
  })

  it('adds one edge for a link both of its tickets report', () => {
    const chart = aChart({ nodes: twoTickets })
    const change = reconcile(chart, [
      anIssue('GEO-1', { links: [blocks('10001')] }),
      anIssue('GEO-2', { links: [blocks('10001')] }),
    ])
    expect(change.edgeAdditions).toEqual([
      { id: 'jira-10001', from: 'geo-1', to: 'geo-2', source: { kind: 'jira', linkId: '10001' } },
    ])
  })

  it('removes a jira edge whose link is gone, and keeps a local edge over the same pair', () => {
    const chart = aChart({
      nodes: twoTickets,
      edges: [
        { id: 'jira-10001', from: 'geo-1', to: 'geo-2', source: { kind: 'jira', linkId: '10001' } },
        anEdge('declared', 'geo-1', 'geo-2'),
      ],
    })
    const change = reconcile(chart, [anIssue('GEO-1'), anIssue('GEO-2')])
    expect(change.edgeRemovals).toEqual(['jira-10001'])
    expect(applyReconciliation(chart, change).edges).toEqual([chart.edges[1]])
  })

  it('leaves a jira edge alone when one of its tickets was not in the search at all', () => {
    const chart = aChart({
      nodes: twoTickets,
      edges: [
        { id: 'jira-10001', from: 'geo-1', to: 'geo-2', source: { kind: 'jira', linkId: '10001' } },
      ],
    })
    // GEO-2 left the epic: an absence of evidence, not evidence the link went.
    const change = reconcile(chart, [anIssue('GEO-1')])
    expect(change.edgeRemovals).toEqual([])
    expect(change.orphanedIds).toEqual(['geo-2'])
  })

  it('promotes a local edge whose pair Jira now reports, rather than drawing it twice', () => {
    const chart = aChart({ nodes: twoTickets, edges: [anEdge('declared', 'geo-1', 'geo-2')] })
    const change = reconcile(chart, [
      anIssue('GEO-1', { links: [blocks('10001')] }),
      anIssue('GEO-2'),
    ])
    expect(change.edgePromotions).toEqual([
      { edgeId: 'declared', source: { kind: 'jira', linkId: '10001' } },
    ])
    expect(change.edgeAdditions).toEqual([])
    expect(applyReconciliation(chart, change).edges).toEqual([
      { id: 'declared', from: 'geo-1', to: 'geo-2', source: { kind: 'jira', linkId: '10001' } },
    ])
  })

  it('ignores a link whose other end is not a lane in this chart', () => {
    const chart = aChart({
      nodes: [aNode('geo-1', { source: { kind: 'jira', key: 'GEO-1' } })],
    })
    const change = reconcile(chart, [
      anIssue('GEO-1', { links: [{ linkId: '1', blockerKey: 'GEO-1', blockedKey: 'GEO-77' }] }),
    ])
    expect(change.edgeAdditions).toEqual([])
  })

  it('counts what it did, for the one changelog entry a sync writes', () => {
    const chart = aChart({ nodes: twoTickets })
    const change = reconcile(chart, [
      anIssue('GEO-1', { links: [blocks('10001')] }),
      anIssue('GEO-3'),
    ])
    expect(countsOf(change)).toEqual({
      updated: 1,
      added: 1,
      orphaned: 1,
      edgesAdded: 1,
      edgesRemoved: 0,
      edgesPromoted: 0,
    })
  })
})
