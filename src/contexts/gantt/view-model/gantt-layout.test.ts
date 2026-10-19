import { describe, expect, it } from 'vitest'
import type { Column, GanttChart, GanttEdge, GanttNode, GanttNodeSource } from '~/kernel'
import { ancestorsOf, layout, type GanttLayoutOptions } from './gantt-layout'

// The whole geometry, table-tested, with no React anywhere near it — which is
// the claim the slice exists to make (ADR-0003, ADR-0012 §10).
//
// The two assertions worth reading twice are the arrow ones: an arrow whose
// endpoints collapse onto the same node is **dropped**, and narrowing
// `visibleRange` changes which rows come back and **nothing else**.

type NodeSpec = {
  readonly parentId?: string | null
  readonly order?: number
  readonly start?: string | null
  readonly end?: string | null
  readonly column?: Column
  readonly source?: GanttNodeSource
  readonly orphaned?: boolean
}

function node(id: string, spec: NodeSpec = {}): GanttNode {
  return {
    id,
    parentId: spec.parentId ?? null,
    order: spec.order ?? 0,
    title: id,
    source: spec.source ?? { kind: 'local' },
    start: spec.start ?? null,
    end: spec.end ?? null,
    column: spec.column ?? 'TO DO',
    status: null,
    assignee: null,
    discovered: false,
    orphaned: spec.orphaned ?? false,
  }
}

/** `a>b` reads "a blocks b". */
function edge(spec: string): GanttEdge {
  const [from = '', to = ''] = spec.split('>')
  return { id: `${from}-${to}`, from, to, source: { kind: 'local' } }
}

function chart(nodes: readonly GanttNode[], edgeSpecs: readonly string[] = []): GanttChart {
  return {
    version: 1,
    id: 'chart',
    title: 'Chart',
    jiraSources: [],
    lastSyncedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    nodes: [...nodes],
    edges: edgeSpecs.map(edge),
  }
}

const BASE: GanttLayoutOptions = {
  zoom: 'month',
  collapsed: new Set(),
  expandedInfo: new Set(),
  visibleRange: { first: 0, count: 100 },
  today: '2026-10-07',
}

function opts(overrides: Partial<GanttLayoutOptions> = {}): GanttLayoutOptions {
  return { ...BASE, ...overrides }
}

/** Two PRD lanes with two and three features under them. */
const TWO_PRDS: readonly GanttNode[] = [
  node('p1', { order: 0, start: '2026-10-01', end: '2026-10-31' }),
  node('a1', { parentId: 'p1', order: 0, start: '2026-10-01', end: '2026-10-10' }),
  node('a2', { parentId: 'p1', order: 1, start: '2026-10-11', end: '2026-10-20' }),
  node('p2', { order: 1, start: '2026-11-01', end: '2026-11-30' }),
  node('b1', { parentId: 'p2', order: 0 }),
  node('b2', { parentId: 'p2', order: 1 }),
  node('b3', { parentId: 'p2', order: 2 }),
]

function arrowPairs(result: ReturnType<typeof layout>): string[] {
  return result.arrows.map((arrow) => `${arrow.from}>${arrow.to}`).toSorted()
}

describe('layout rows and bars', () => {
  it('returns every visible row in reading order, with its absolute index', () => {
    const result = layout(chart(TWO_PRDS), opts())

    expect(result.rows.map((row) => [row.node.id, row.index, row.depth])).toEqual([
      ['p1', 0, 0],
      ['a1', 1, 1],
      ['a2', 2, 1],
      ['p2', 3, 0],
      ['b1', 4, 1],
      ['b2', 5, 1],
      ['b3', 6, 1],
    ])
    expect(result.totalRows).toBe(7)
  })

  it('gives every dated row a bar and an undated row none', () => {
    const result = layout(chart(TWO_PRDS), opts())

    expect([...result.bars.keys()].toSorted()).toEqual(['a1', 'a2', 'p1', 'p2'])
    expect(result.rows.find((row) => row.node.id === 'b1')).toMatchObject({ undated: true })
    expect(result.bars.has('b1')).toBe(false)
  })

  it('places a bar as a fraction of the axis, end date inclusive', () => {
    // Axis: October, 31 days. `a1` is the 1st to the 10th — ten days from zero.
    const result = layout(
      chart([node('a1', { start: '2026-10-01', end: '2026-10-10' })]),
      opts({ zoom: 'month' }),
    )

    expect(result.bars.get('a1')).toMatchObject({ x: 0, width: 10 / 31, column: 'TO DO' })
  })

  it('carries the derived blocked state onto the bar', () => {
    const result = layout(
      chart(
        [
          node('blocker', { start: '2026-10-01', end: '2026-10-05' }),
          node('waiter', { start: '2026-10-06', end: '2026-10-10' }),
        ],
        ['blocker>waiter'],
      ),
      opts(),
    )

    expect(result.bars.get('waiter')?.blocked).toBe('blocked')
    expect(result.bars.get('blocker')?.blocked).toBe('none')
  })

  it('marks the rows whose info band is open', () => {
    const result = layout(chart(TWO_PRDS), opts({ expandedInfo: new Set(['a1']) }))

    expect(result.rows.filter((row) => row.infoExpanded).map((row) => row.node.id)).toEqual(['a1'])
  })

  it('draws the child-span underlay and flags an overrun', () => {
    const result = layout(
      chart([
        node('prd', { start: '2026-10-01', end: '2026-10-31' }),
        node('feature', { parentId: 'prd', start: '2026-10-15', end: '2026-11-20' }),
      ]),
      opts({ zoom: 'quarter' }),
    )

    expect(result.childSpans.get('prd')).toMatchObject({ overflow: true })
    expect(result.childSpans.has('feature')).toBe(false)
  })
})

// A lane with a start and **no end** is work that has demonstrably begun and
// that nobody has forecast a finish for. It gets a bar to today, flagged
// `openEnded` so the view can draw it unterminated — not a blank row, and not a
// bar that looks like it ends today.
describe('layout open-ended bars', () => {
  it('draws a bar from the start to today and flags it', () => {
    const result = layout(
      chart([node('running', { start: '2026-10-05' })]),
      opts({ zoom: 'month', today: '2026-10-07' }),
    )

    // October, 31 days: the 5th to the 7th inclusive is three days from the 4th.
    expect(result.bars.get('running')).toMatchObject({
      x: 4 / 31,
      width: 3 / 31,
      openEnded: true,
    })
  })

  it('marks a fully dated bar as not open-ended', () => {
    const result = layout(chart(TWO_PRDS), opts())

    expect(result.bars.get('a1')).toMatchObject({ openEnded: false })
  })

  it('is not an undated row, and an undated row is still bar-less', () => {
    const result = layout(
      chart([node('running', { start: '2026-10-05' }), node('nothing')]),
      opts(),
    )

    expect(result.rows.find((row) => row.node.id === 'running')).toMatchObject({ undated: false })
    expect(result.rows.find((row) => row.node.id === 'nothing')).toMatchObject({ undated: true })
    expect(result.bars.has('nothing')).toBe(false)
  })

  it('reads an end with no start as undated rather than open-ended', () => {
    // Half-dated the other way round: there is nothing to draw from.
    const result = layout(chart([node('backwards', { end: '2026-10-31' })]), opts())

    expect(result.rows[0]).toMatchObject({ undated: true })
    expect(result.bars.size).toBe(0)
  })

  it('builds the axis from an open-ended start, and runs the bar to the axis end', () => {
    // A chart of nothing but in-flight work: without the start in the extent
    // there is no domain at all. 2026-09-14 is a Monday, so the padded week
    // zoom axis is exactly that week — which today is well past.
    const result = layout(
      chart([node('running', { start: '2026-09-14' })]),
      opts({ zoom: 'week', today: '2026-10-07' }),
    )

    expect(result.ticks[0]?.key).toBe('2026-09-14')
    expect(result.todayX).toBeNull()
    expect(result.bars.get('running')).toMatchObject({ x: 0, width: 1, openEnded: true })
  })

  it('is one day wide when today has not reached the start yet', () => {
    const result = layout(
      chart([node('future', { start: '2026-10-20' })]),
      opts({ zoom: 'month', today: '2026-10-07' }),
    )

    expect(result.bars.get('future')).toMatchObject({ x: 19 / 31, width: 1 / 31 })
  })

  it('carries the column tone and the blocked state like any other bar', () => {
    const result = layout(
      chart(
        [
          node('blocker', { start: '2026-10-01', end: '2026-10-05' }),
          node('running', { start: '2026-10-06', column: 'In Implementation' }),
        ],
        ['blocker>running'],
      ),
      opts(),
    )

    expect(result.bars.get('running')).toMatchObject({
      column: 'In Implementation',
      blocked: 'blocked',
      openEnded: true,
    })
  })
})

// An axis, a today line and a screenful of empty rows reads as a broken chart
// rather than as one waiting to be dated — so the layout states which it is.
describe('layout nothingDated', () => {
  it('is true for a chart where no lane has even started', () => {
    const result = layout(chart([node('a'), node('b'), node('c', { end: '2026-10-31' })]), opts())

    expect(result.nothingDated).toBe(true)
  })

  it('is false once one lane is dated', () => {
    const result = layout(
      chart([node('a'), node('dated', { start: '2026-10-01', end: '2026-10-05' })]),
      opts(),
    )

    expect(result.nothingDated).toBe(false)
  })

  it('is false when the only dated lane is open-ended', () => {
    expect(layout(chart([node('running', { start: '2026-10-05' })]), opts()).nothingDated).toBe(
      false,
    )
  })

  it('is a fact about the chart rather than about the window', () => {
    // A dated lane collapsed out of view, or windowed out of it, is still a
    // dated lane.
    const nodes = [
      node('prd'),
      node('child', { parentId: 'prd', start: '2026-10-01', end: '2026-10-05' }),
    ]

    expect(layout(chart(nodes), opts({ collapsed: new Set(['prd']) })).nothingDated).toBe(false)
    expect(layout(chart(nodes), opts({ visibleRange: { first: 0, count: 1 } })).nothingDated).toBe(
      false,
    )
  })
})

describe('layout windowing', () => {
  it('returns only the windowed rows, still carrying their absolute index', () => {
    const result = layout(chart(TWO_PRDS), opts({ visibleRange: { first: 3, count: 2 } }))

    expect(result.rows.map((row) => [row.node.id, row.index])).toEqual([
      ['p2', 3],
      ['b1', 4],
    ])
    expect(result.totalRows).toBe(7)
  })

  it('treats a count past the end as the last page rather than an error', () => {
    const result = layout(chart(TWO_PRDS), opts({ visibleRange: { first: 5, count: 50 } }))

    expect(result.rows.map((row) => row.node.id)).toEqual(['b2', 'b3'])
  })

  it('leaves arrow endpoints identical to the unnarrowed call', () => {
    // The claim windowing lives or dies on: it decides what is *drawn*, never
    // what an arrow points at.
    const edges = ['a1>b1', 'a2>b3']
    const whole = layout(chart(TWO_PRDS, edges), opts())
    const narrowed = layout(chart(TWO_PRDS, edges), opts({ visibleRange: { first: 5, count: 1 } }))

    expect(narrowed.rows).toHaveLength(1)
    expect(narrowed.arrows).toEqual(whole.arrows)
    expect(narrowed.needsAttention).toEqual(whole.needsAttention)
    expect(narrowed.ticks).toEqual(whole.ticks)
  })
})

describe('layout arrows', () => {
  it('draws a plain arrow when both endpoints are visible', () => {
    const result = layout(chart(TWO_PRDS, ['a1>b1']), opts())

    expect(result.arrows).toEqual([
      { id: 'a1→b1', from: 'a1', to: 'b1', count: 1, edgeIds: ['a1-b1'], inCycle: false },
    ])
  })

  it('re-anchors a collapsed endpoint to its nearest visible ancestor', () => {
    const result = layout(chart(TWO_PRDS, ['a1>b1']), opts({ collapsed: new Set(['p2']) }))

    expect(arrowPairs(result)).toEqual(['a1>p2'])
  })

  it('re-anchors through two collapsed levels to the lane that is on screen', () => {
    const deep = [
      node('p1'),
      node('mid', { parentId: 'p1' }),
      node('leaf', { parentId: 'mid' }),
      node('other'),
    ]
    const result = layout(chart(deep, ['leaf>other']), opts({ collapsed: new Set(['p1']) }))

    expect(arrowPairs(result)).toEqual(['p1>other'])
  })

  it('drops an arrow whose endpoints land on the same node', () => {
    // Two children of one collapsed parent waiting on each other is a self-loop,
    // and a self-arrow communicates nothing.
    const result = layout(chart(TWO_PRDS, ['a1>a2']), opts({ collapsed: new Set(['p1']) }))

    expect(result.arrows).toEqual([])
  })

  it('merges arrows that land on the same ordered pair, carrying a count', () => {
    const result = layout(
      chart(TWO_PRDS, ['b1>a1', 'b2>a1', 'b3>a1']),
      opts({ collapsed: new Set(['p2']) }),
    )

    expect(result.arrows).toEqual([
      {
        id: 'p2→a1',
        from: 'p2',
        to: 'a1',
        count: 3,
        edgeIds: ['b1-a1', 'b2-a1', 'b3-a1'],
        inCycle: false,
      },
    ])
  })

  it('keeps the two directions of a pair apart', () => {
    const result = layout(chart(TWO_PRDS, ['a1>b1', 'b2>a2']), opts({ collapsed: new Set(['p2']) }))

    expect(arrowPairs(result)).toEqual(['a1>p2', 'p2>a2'])
  })

  it('marks an arrow whose edge is in a cycle', () => {
    const result = layout(chart(TWO_PRDS, ['a1>b1', 'b1>a1', 'a2>b2']), opts())

    expect(
      result.arrows
        .filter((arrow) => arrow.inCycle)
        .map((arrow) => arrow.id)
        .toSorted(),
    ).toEqual(['a1→b1', 'b1→a1'])
    expect(result.cycles.map((cycle) => [...cycle.nodeIds].toSorted())).toEqual([['a1', 'b1']])
  })

  it('marks a merged arrow in a cycle when any of its edges is', () => {
    const result = layout(
      chart(TWO_PRDS, ['b1>a1', 'a1>b2', 'b2>a1']),
      opts({ collapsed: new Set(['p2']) }),
    )

    expect(result.arrows.find((arrow) => arrow.id === 'p2→a1')).toMatchObject({
      count: 2,
      inCycle: true,
    })
  })
})

describe('layout ticks', () => {
  const OCTOBER_WEEK = [node('a', { start: '2026-10-05', end: '2026-10-09' })]

  it('labels days at week zoom, over whole weeks', () => {
    // 2026-10-05 is a Monday, so the padded axis is exactly that week.
    const { ticks } = layout(chart(OCTOBER_WEEK), opts({ zoom: 'week' }))

    expect(ticks.map((tick) => tick.label)).toEqual([
      'Mon 5',
      'Tue 6',
      'Wed 7',
      'Thu 8',
      'Fri 9',
      'Sat 10',
      'Sun 11',
    ])
    expect(ticks[0]?.key).toBe('2026-10-05')
  })

  it('labels week numbers at month zoom, over whole months', () => {
    const { ticks } = layout(chart(OCTOBER_WEEK), opts({ zoom: 'month' }))

    expect(ticks[0]?.key).toBe('2026-10-01')
    expect(ticks.map((tick) => tick.label)).toEqual(['W40', 'W41', 'W42', 'W43', 'W44'])
  })

  it('labels month names at quarter zoom, over whole quarters', () => {
    const { ticks } = layout(chart(OCTOBER_WEEK), opts({ zoom: 'quarter' }))

    expect(ticks.map((tick) => tick.label)).toEqual(['Oct', 'Nov', 'Dec'])
    expect(ticks[0]?.key).toBe('2026-10-01')
  })

  it.each(['week', 'month', 'quarter'] as const)('tiles the whole axis at %s zoom', (zoom) => {
    const { ticks } = layout(chart(OCTOBER_WEEK), opts({ zoom }))

    expect(ticks[0]?.x).toBe(0)
    expect(ticks.reduce((sum, tick) => sum + tick.width, 0)).toBeCloseTo(1, 10)
  })

  it.each(['week', 'month', 'quarter'] as const)(
    'puts the today marker inside the axis at %s zoom',
    (zoom) => {
      const { todayX } = layout(chart(OCTOBER_WEEK), opts({ zoom, today: '2026-10-07' }))

      expect(todayX).toBeGreaterThan(0)
      expect(todayX).toBeLessThan(1)
    },
  )

  it('has no today marker when today falls outside the chart', () => {
    expect(layout(chart(OCTOBER_WEEK), opts({ today: '2025-01-01' })).todayX).toBeNull()
  })

  it('still draws an axis for a chart where nothing is dated', () => {
    // Import leaves a chart exactly like this, and the rows are still worth reading.
    const { ticks, todayX } = layout(chart([node('a')]), opts({ zoom: 'week' }))

    expect(ticks).toHaveLength(7)
    expect(ticks[0]?.key).toBe('2026-10-05')
    expect(todayX).not.toBeNull()
  })
})

describe('layout needsAttention', () => {
  it('counts the undated rows and names them', () => {
    const result = layout(chart(TWO_PRDS), opts())

    expect(result.needsAttention.undated).toEqual(['b1', 'b2', 'b3'])
  })

  it('counts the in-flight rows apart from the undated ones', () => {
    // The distinction the header exists to make: "nobody knows when this
    // starts" and "nobody has forecast when this ends" ask for different work.
    const result = layout(
      chart([
        node('done', { start: '2026-10-01', end: '2026-10-05' }),
        node('running', { start: '2026-10-06' }),
        node('also-running', { start: '2026-10-07' }),
        node('nothing'),
      ]),
      opts(),
    )

    expect(result.needsAttention).toMatchObject({
      undated: ['nothing'],
      openEnded: ['running', 'also-running'],
      total: 3,
    })
  })

  it('counts a childless jira node still sitting where import dropped it', () => {
    const result = layout(
      chart([
        node('prd'),
        node('geo-120', { source: { kind: 'jira', key: 'GEO-120' } }),
        node('geo-121', { parentId: 'prd', source: { kind: 'jira', key: 'GEO-121' } }),
      ]),
      opts(),
    )

    expect(result.needsAttention.unplacedAtRoot).toEqual(['geo-120'])
  })

  it('leaves a root jira lane that has children alone', () => {
    const result = layout(
      chart([
        node('geo-120', { source: { kind: 'jira', key: 'GEO-120' } }),
        node('child', { parentId: 'geo-120' }),
      ]),
      opts(),
    )

    expect(result.needsAttention.unplacedAtRoot).toEqual([])
  })

  it('counts a node whose parentId named a node that is not in the chart', () => {
    const result = layout(chart([node('stray', { parentId: 'ghost' })]), opts())

    expect(result.needsAttention.unplacedAtRoot).toEqual(['stray'])
    expect(result.rows.map((row) => row.node.id)).toEqual(['stray'])
  })

  it('counts the nodes sync marked orphaned', () => {
    const result = layout(chart([node('gone', { orphaned: true }), node('here')]), opts())

    expect(result.needsAttention.orphaned).toEqual(['gone'])
  })

  it('counts a node needing attention for two reasons once in the total', () => {
    const result = layout(chart([node('gone', { orphaned: true })]), opts())

    expect(result.needsAttention).toMatchObject({
      undated: ['gone'],
      orphaned: ['gone'],
      total: 1,
    })
  })

  it('is empty for a chart with nothing to report', () => {
    const result = layout(chart([node('a', { start: '2026-10-01', end: '2026-10-02' })]), opts())

    expect(result.needsAttention).toEqual({
      undated: [],
      openEnded: [],
      unplacedAtRoot: [],
      orphaned: [],
      total: 0,
    })
  })
})

// What the palette's `g` hand-off unfolds. A lane cannot be scrolled to while a
// collapsed parent is hiding it, so the reveal has to know the whole chain.
describe('ancestorsOf', () => {
  const deep = chart([
    node('prd'),
    node('feature', { parentId: 'prd' }),
    node('task', { parentId: 'feature' }),
    node('root-lane'),
  ])

  it('walks the chain nearest first, so unfolding it is one pass', () => {
    expect(ancestorsOf(deep, 'task')).toEqual(['feature', 'prd'])
    expect(ancestorsOf(deep, 'feature')).toEqual(['prd'])
  })

  it('reads a root lane as having none', () => {
    expect(ancestorsOf(deep, 'root-lane')).toEqual([])
  })

  // `?node=` is hostile input until proven otherwise: a stale link must land on
  // the chart rather than throwing.
  it('reads a node the chart does not have as having none', () => {
    expect(ancestorsOf(deep, 'ghost')).toEqual([])
  })

  // The **effective** parent, not the stored one: `buildTree` re-roots a node
  // whose parent is missing, so the chain that is drawn is the chain to unfold.
  it('stops where a missing parent re-rooted the lane', () => {
    const orphanParent = chart([node('child', { parentId: 'nowhere' })])
    expect(ancestorsOf(orphanParent, 'child')).toEqual([])
  })

  // A `parentId` cycle is cut by `buildTree` at its first repeat; walking the
  // cut forest terminates rather than descending forever.
  it('terminates on a parentId cycle', () => {
    const cyclic = chart([
      node('a', { parentId: 'b' }),
      node('b', { parentId: 'c' }),
      node('c', { parentId: 'a' }),
    ])
    const walked = ancestorsOf(cyclic, 'b')
    expect(new Set(walked).size).toBe(walked.length)
    expect(walked.length).toBeLessThan(3)
  })
})
