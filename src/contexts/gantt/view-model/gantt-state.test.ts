import { describe, expect, it } from 'vitest'
import type { GanttChart, GanttNode } from '~/kernel'
import { initialGanttState, reduce, type GanttEvent, type GanttState } from './gantt-state'

// The reducer is exhaustive over its event union by construction — removing an
// arm is a compile error, which is the guarantee, and no test can assert a
// compile error. What the last case here asserts is the runtime half of the same
// thing: an event from outside the union is a throw rather than a silent no-op.

function node(id: string, start: string | null = null, end: string | null = null): GanttNode {
  return {
    id,
    parentId: null,
    order: 0,
    title: id,
    source: { kind: 'local' },
    start,
    end,
    column: 'TO DO',
    status: null,
    assignee: null,
    discovered: false,
    orphaned: false,
  }
}

function chart(nodes: readonly GanttNode[]): GanttChart {
  return {
    version: 1,
    id: 'chart',
    title: 'Chart',
    jiraSources: [],
    lastSyncedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    nodes: [...nodes],
    edges: [],
  }
}

const STATE: GanttState = {
  zoom: 'month',
  collapsed: new Set(['p1']),
  expandedInfo: new Set(['a1']),
  revealed: null,
  selected: null,
}

describe('initialGanttState', () => {
  it.each([
    ['one day', '2026-10-01', 'week'],
    ['six weeks exactly', '2026-11-11', 'week'],
    ['a day over six weeks', '2026-11-12', 'month'],
    ['nine months', '2027-07-06', 'month'],
    ['a day over nine months', '2027-07-07', 'quarter'],
    ['three years', '2029-10-01', 'quarter'],
  ] as const)('opens a chart spanning %s at %s zoom', (_name, end, zoom) => {
    expect(initialGanttState(chart([node('a', '2026-10-01', end)])).zoom).toBe(zoom)
  })

  it('opens a chart with nothing dated at week zoom', () => {
    expect(initialGanttState(chart([node('a')])).zoom).toBe('week')
  })

  it('ignores half-dated nodes when measuring the extent', () => {
    expect(initialGanttState(chart([node('a', '2026-10-01', null), node('b')])).zoom).toBe('week')
  })

  it('collapses nothing and opens no info band', () => {
    const state = initialGanttState(chart([node('a')]))

    expect(state.collapsed.size).toBe(0)
    expect(state.expandedInfo.size).toBe(0)
  })
})

describe('reduce', () => {
  it('sets the zoom and leaves everything else alone', () => {
    expect(reduce(STATE, { type: 'zoomSet', zoom: 'quarter' })).toEqual({
      ...STATE,
      zoom: 'quarter',
    })
  })

  it('toggles a lane collapsed, then expanded again', () => {
    const collapsed = reduce(STATE, { type: 'collapseToggled', nodeId: 'a1' })
    expect([...collapsed.collapsed].toSorted()).toEqual(['a1', 'p1'])

    const expanded = reduce(collapsed, { type: 'collapseToggled', nodeId: 'a1' })
    expect([...expanded.collapsed]).toEqual(['p1'])
  })

  it('collapses exactly the ids the event names', () => {
    const next = reduce(STATE, { type: 'allCollapsed', parentIds: ['p1', 'p2'] })

    expect([...next.collapsed].toSorted()).toEqual(['p1', 'p2'])
  })

  it('expands everything', () => {
    expect(reduce(STATE, { type: 'allExpanded' }).collapsed.size).toBe(0)
  })

  it('leaves the info bands alone when collapsing', () => {
    // Collapsing hides a lane's children; the body belongs to the lane itself.
    const next = reduce(STATE, { type: 'collapseToggled', nodeId: 'a1' })

    expect([...next.expandedInfo]).toEqual(['a1'])
  })

  it('toggles an info band', () => {
    expect(
      [...reduce(STATE, { type: 'infoToggled', nodeId: 'b1' }).expandedInfo].toSorted(),
    ).toEqual(['a1', 'b1'])
    expect([...reduce(STATE, { type: 'infoToggled', nodeId: 'a1' }).expandedInfo]).toEqual([])
  })

  // The palette's `g` hand-off: unfolding the ancestors is the whole mechanism,
  // since a lane behind a collapsed parent is not a row to scroll to at all.
  it('reveals a lane by unfolding its ancestors and naming it', () => {
    const folded: GanttState = {
      ...STATE,
      collapsed: new Set(['p1', 'prd', 'feature', 'elsewhere']),
    }
    const revealed = reduce(folded, {
      type: 'revealed',
      nodeId: 'task',
      ancestorIds: ['feature', 'prd'],
    })

    expect([...revealed.collapsed].toSorted()).toEqual(['elsewhere', 'p1'])
    expect(revealed.revealed).toBe('task')
  })

  it('reveals a lane that was already visible without folding anything else', () => {
    const revealed = reduce(STATE, { type: 'revealed', nodeId: 'a1', ancestorIds: [] })
    expect([...revealed.collapsed]).toEqual(['p1'])
    expect(revealed.revealed).toBe('a1')
  })

  it('takes a restored state wholesale, from wherever the presenter kept it', () => {
    const restored: GanttState = {
      zoom: 'week',
      collapsed: new Set(['x']),
      expandedInfo: new Set(),
      revealed: 'x1',
      selected: 'x2',
    }

    expect(reduce(STATE, { type: 'restored', state: restored })).toEqual(restored)
  })

  // Selecting a lane is what makes any arrow appear at all: the chart draws none
  // by default, because 54 edges over 30 lanes is a thicket (ADR-0012 §10's
  // amendment). Toggling is the way back out, since the control is the bar.
  it('selects a lane, and clears it when the same lane is selected again', () => {
    const lit = reduce(STATE, { type: 'selectionToggled', nodeId: 'a1' })
    expect(lit.selected).toBe('a1')

    expect(reduce(lit, { type: 'selectionToggled', nodeId: 'a1' }).selected).toBeNull()
  })

  it('moves the selection to a different lane rather than adding to it', () => {
    const lit = reduce(STATE, { type: 'selectionToggled', nodeId: 'a1' })

    expect(reduce(lit, { type: 'selectionToggled', nodeId: 'a2' }).selected).toBe('a2')
  })

  it('clears the selection without naming a lane', () => {
    const lit = reduce(STATE, { type: 'selectionToggled', nodeId: 'a1' })

    expect(reduce(lit, { type: 'selectionCleared' }).selected).toBeNull()
  })

  it('opens with nothing selected, so a fresh chart draws no arrows', () => {
    expect(initialGanttState(chart([node('p1')])).selected).toBeNull()
  })

  it('never mutates the state it was given', () => {
    const before = { ...STATE, collapsed: new Set(STATE.collapsed) }
    reduce(STATE, { type: 'collapseToggled', nodeId: 'a1' })

    expect([...STATE.collapsed]).toEqual([...before.collapsed])
  })

  it('throws on an event from outside the union rather than ignoring it', () => {
    const rogue = { type: 'nodeDragged' } as unknown as GanttEvent

    expect(() => reduce(STATE, rogue)).toThrow()
  })
})
