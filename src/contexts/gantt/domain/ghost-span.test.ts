import { describe, expect, it } from 'vitest'
import type { GanttChart, GanttEdge, GanttNode } from '~/kernel'
import { ghostSpansFor, GHOST_SPAN_DAYS } from './ghost-span'
import { buildTree } from './tree'

// The invented span, table-tested — and the three rules are what the tables are
// for: leaves only, never in the past, and after whatever blocks it.
//
// The assertion worth reading twice is the chain one. Three undated tickets in a
// row must read as three consecutive weeks, not as three bars stacked on today,
// because the ordering *is* the answer to "what do I work on next" — which is the
// question the blank rendering this replaces could not answer at all.

const TODAY = '2026-10-19'

function node(id: string, spec: Partial<GanttNode> = {}): GanttNode {
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
    discovered: false,
    orphaned: false,
    ...spec,
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

function ghosts(nodes: readonly GanttNode[], edgeSpecs: readonly string[] = [], today = TODAY) {
  const built = chart(nodes, edgeSpecs)
  return ghostSpansFor(built, buildTree(built.nodes), today)
}

describe('which lanes get a ghost', () => {
  it('gives an undated childless lane a week starting today', () => {
    expect(ghosts([node('a')]).get('a')).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
      afterBlocker: null,
    })
  })

  it('spans exactly GHOST_SPAN_DAYS inclusive', () => {
    const span = ghosts([node('a')]).get('a')
    const days =
      (Date.parse(`${span?.end ?? ''}T00:00:00Z`) - Date.parse(`${span?.start ?? ''}T00:00:00Z`)) /
        86_400_000 +
      1
    expect(days).toBe(GHOST_SPAN_DAYS)
  })

  it('leaves a fully dated lane alone', () => {
    expect(ghosts([node('a', { start: '2026-11-01', end: '2026-11-10' })].slice()).has('a')).toBe(
      false,
    )
  })

  it('leaves an open-ended lane alone — a known start is not undated', () => {
    expect(ghosts([node('a', { start: '2026-10-01' })]).has('a')).toBe(false)
  })

  it('leaves an undated parent alone — its child-span underlay already answers "when"', () => {
    const spans = ghosts([node('p'), node('c', { parentId: 'p' })])
    expect(spans.has('p')).toBe(false)
    expect(spans.has('c')).toBe(true)
  })
})

describe('placement behind blockers', () => {
  it('starts the day after a dated blocker ends', () => {
    expect(
      ghosts([node('a', { start: '2026-10-26', end: '2026-11-02' }), node('b')], ['a>b']),
    ).toEqual(new Map([['b', { start: '2026-11-03', end: '2026-11-09', afterBlocker: 'a' }]]))
  })

  it('never starts in the past, however long ago the blocker finished', () => {
    expect(
      ghosts([node('a', { start: '2026-09-01', end: '2026-09-08' }), node('b')], ['a>b']).get('b'),
    ).toEqual({ start: TODAY, end: '2026-10-25', afterBlocker: null })
  })

  it('takes the latest of several blockers, and names it', () => {
    const spans = ghosts(
      [
        node('a', { start: '2026-10-20', end: '2026-10-27' }),
        node('b', { start: '2026-10-20', end: '2026-11-05' }),
        node('c'),
      ],
      ['a>c', 'b>c'],
    )
    expect(spans.get('c')).toEqual({
      start: '2026-11-06',
      end: '2026-11-12',
      afterBlocker: 'b',
    })
  })

  it('queues a chain of undated work into consecutive weeks', () => {
    const spans = ghosts([node('a'), node('b'), node('c')], ['a>b', 'b>c'])

    expect([...spans].map(([id, span]) => [id, span.start, span.end])).toEqual([
      ['a', '2026-10-19', '2026-10-25'],
      ['b', '2026-10-26', '2026-11-01'],
      ['c', '2026-11-02', '2026-11-08'],
    ])
  })

  it('falls back to today behind an open-ended blocker, inventing no forecast for it', () => {
    expect(ghosts([node('a', { start: '2026-10-01' }), node('b')], ['a>b']).get('b')).toEqual({
      start: TODAY,
      end: '2026-10-25',
      afterBlocker: null,
    })
  })

  it('ignores an edge from a node the chart does not have', () => {
    expect(ghosts([node('b')], ['ghost>b']).get('b')?.start).toBe(TODAY)
  })

  it('collapses a blocks cycle onto today rather than recursing', () => {
    const spans = ghosts([node('a'), node('b')], ['a>b', 'b>a'])

    expect(spans.get('b')?.start).toBe(TODAY)
    // `a` resolves after `b` has a span, so it queues behind it — deterministic
    // by node order, and the loop itself is `cycles.ts`'s to report.
    expect(spans.get('a')?.start).toBe('2026-10-26')
  })
})
