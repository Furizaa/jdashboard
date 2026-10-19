import { describe, expect, it } from 'vitest'
import type { GanttNode } from '~/kernel'
import { axisExtentOf, childSpanFor, datedExtentOf, datedSpanOf, openSpanOf } from './child-span'
import { buildTree } from './tree'

// The underlay that makes slip visible. Two claims: undated descendants
// contribute nothing — an undecomposed quarter and a quarter whose features are
// all undated must not look alike — and `overflow` fires on either side.

function node(
  id: string,
  dates: readonly [string | null, string | null] = [null, null],
  parentId: string | null = null,
): GanttNode {
  return {
    id,
    parentId,
    order: 0,
    title: id,
    source: { kind: 'local' },
    start: dates[0],
    end: dates[1],
    column: 'TO DO',
    status: null,
    assignee: null,
    discovered: false,
    orphaned: false,
  }
}

const Q4 = ['2026-10-01', '2026-12-31'] as const

describe('datedSpanOf', () => {
  it.each([
    ['both ends', ['2026-10-01', '2026-10-31'], { start: '2026-10-01', end: '2026-10-31' }],
    ['no ends', [null, null], null],
    ['a start only', ['2026-10-01', null], null],
    ['an end only', [null, '2026-10-31'], null],
  ] as const)('a node with %s', (_name, dates, expected) => {
    expect(datedSpanOf(node('n', dates))).toEqual(expected)
  })
})

// The state `datedSpanOf` refuses to name, given a name of its own. The two are
// exclusive: every node is fully dated, open-ended, or undated, and the pairs
// below assert that for all four combinations at once.
describe('openSpanOf', () => {
  it.each([
    ['both ends', ['2026-10-01', '2026-10-31'], null],
    ['no ends', [null, null], null],
    ['a start only', ['2026-10-01', null], { start: '2026-10-01', end: null }],
    ['an end only', [null, '2026-10-31'], null],
  ] as const)('a node with %s', (_name, dates, expected) => {
    expect(openSpanOf(node('n', dates))).toEqual(expected)
  })

  it.each([
    ['both ends', ['2026-10-01', '2026-10-31']],
    ['no ends', [null, null]],
    ['a start only', ['2026-10-01', null]],
    ['an end only', [null, '2026-10-31']],
  ] as const)('is never both a dated span and an open one, with %s', (_name, dates) => {
    const subject = node('n', dates)

    expect(datedSpanOf(subject) === null || openSpanOf(subject) === null).toBe(true)
  })
})

describe('childSpanFor', () => {
  it('is null for a node with no dated descendants', () => {
    const spans = childSpanFor(buildTree([node('prd', Q4), node('feature', [null, null], 'prd')]))

    expect(spans.get('prd')).toBeNull()
    expect(spans.get('feature')).toBeNull()
  })

  it('ignores undated descendants and spans the dated ones', () => {
    const spans = childSpanFor(
      buildTree([
        node('prd', Q4),
        node('dated', ['2026-10-05', '2026-11-20'], 'prd'),
        node('undated', [null, null], 'prd'),
      ]),
    )

    expect(spans.get('prd')).toEqual({ start: '2026-10-05', end: '2026-11-20', overflow: false })
  })

  it('reaches dated descendants at any depth, through an undated lane', () => {
    const spans = childSpanFor(
      buildTree([
        node('prd', Q4),
        node('feature', [null, null], 'prd'),
        node('task', ['2026-11-02', '2026-11-06'], 'feature'),
      ]),
    )

    expect(spans.get('prd')).toMatchObject({ start: '2026-11-02', end: '2026-11-06' })
  })

  it.each([
    ['before the parent starts', ['2026-09-20', '2026-11-01'], true],
    ['after the parent ends', ['2026-11-01', '2027-01-15'], true],
    ['past both ends', ['2026-09-20', '2027-01-15'], true],
    ['inside the window', ['2026-10-05', '2026-12-20'], false],
    ['exactly on the window', ['2026-10-01', '2026-12-31'], false],
  ] as const)('flags overflow when the children run %s: %s', (_name, dates, overflow) => {
    const spans = childSpanFor(buildTree([node('prd', Q4), node('feature', dates, 'prd')]))

    expect(spans.get('prd')).toMatchObject({ overflow })
  })

  it('cannot overflow a window the parent never declared', () => {
    const spans = childSpanFor(
      buildTree([node('prd'), node('feature', ['2020-01-01', '2030-01-01'], 'prd')]),
    )

    expect(spans.get('prd')).toMatchObject({ overflow: false })
  })

  it('unions a dated lane with the work under it before handing it to its parent', () => {
    const spans = childSpanFor(
      buildTree([
        node('prd', Q4),
        node('feature', ['2026-11-01', '2026-11-30'], 'prd'),
        node('task', ['2027-02-01', '2027-02-10'], 'feature'),
      ]),
    )

    expect(spans.get('feature')).toMatchObject({ end: '2027-02-10', overflow: true })
    expect(spans.get('prd')).toMatchObject({ end: '2027-02-10', overflow: true })
  })
})

describe('datedExtentOf', () => {
  it('is null when nothing is dated', () => {
    expect(datedExtentOf([node('a'), node('b', ['2026-10-01', null])])).toBeNull()
  })

  it('covers every dated node, whatever their nesting', () => {
    expect(
      datedExtentOf([
        node('a', ['2026-11-01', '2026-11-10']),
        node('b', ['2026-10-01', '2026-10-05']),
        node('c', ['2026-12-01', '2026-12-31']),
        node('d'),
      ]),
    ).toEqual({ start: '2026-10-01', end: '2026-12-31' })
  })
})

// Wider than `datedExtentOf` by exactly one thing: an open-ended lane's start.
// Without it a chart of nothing but in-flight work has no domain at all, and the
// bars it does have would be drawn on an axis that does not contain them.
describe('axisExtentOf', () => {
  it('is null only when no node has even started', () => {
    expect(axisExtentOf([node('a'), node('b', [null, '2026-10-31'])])).toBeNull()
  })

  it('is the open start alone for a chart whose only lane is in flight', () => {
    expect(axisExtentOf([node('a', ['2026-10-05', null])])).toEqual({
      start: '2026-10-05',
      end: '2026-10-05',
    })
  })

  it('stretches a dated extent to reach an open-ended start outside it', () => {
    expect(
      axisExtentOf([
        node('done', ['2026-10-01', '2026-10-10']),
        node('early', ['2026-09-15', null]),
        node('late', ['2026-11-20', null]),
      ]),
    ).toEqual({ start: '2026-09-15', end: '2026-11-20' })
  })

  it('leaves a dated extent alone when the open starts fall inside it', () => {
    const nodes = [
      node('done', ['2026-10-01', '2026-12-31']),
      node('running', ['2026-11-01', null]),
    ]

    expect(axisExtentOf(nodes)).toEqual(datedExtentOf(nodes))
  })
})
