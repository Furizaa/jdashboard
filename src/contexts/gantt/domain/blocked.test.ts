import { describe, expect, it } from 'vitest'
import type { Column, GanttChart, GanttEdge, GanttNode } from '~/kernel'
import { blockedStateFor } from './blocked'

// The one derived fact the kernel `Column` cannot express, so the table is the
// whole point: a blocker's column decides the state, and a loop overrides it.

function node(id: string, column: Column = 'TO DO'): GanttNode {
  return {
    id,
    parentId: null,
    order: 0,
    title: id,
    source: { kind: 'local' },
    start: null,
    end: null,
    column,
    status: null,
    assignee: null,
    discovered: false,
    orphaned: false,
  }
}

function edge(from: string, to: string): GanttEdge {
  return { id: `${from}-${to}`, from, to, source: { kind: 'local' } }
}

function chart(nodes: readonly GanttNode[], edges: readonly GanttEdge[] = []): GanttChart {
  return {
    version: 1,
    id: 'chart',
    title: 'Chart',
    jiraSources: [],
    lastSyncedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    nodes: [...nodes],
    edges: [...edges],
  }
}

describe('blockedStateFor', () => {
  it.each([
    ['TO DO', 'blocked'],
    ['In Implementation', 'blocked'],
    ['In Code Review', 'blocked'],
    ['Done', 'none'],
  ] as const)('a node behind a %s blocker is %s', (column, expected) => {
    const state = blockedStateFor(
      chart([node('blocker', column), node('waiter')], [edge('blocker', 'waiter')]),
    )

    expect(state.get('waiter')).toBe(expected)
  })

  it('leaves the blocker itself alone — the arrow points one way', () => {
    const state = blockedStateFor(
      chart([node('blocker'), node('waiter')], [edge('blocker', 'waiter')]),
    )

    expect(state.get('blocker')).toBe('none')
  })

  it('blocks on any unfinished blocker, not all of them', () => {
    const state = blockedStateFor(
      chart(
        [node('shipped', 'Done'), node('pending'), node('waiter')],
        [edge('shipped', 'waiter'), edge('pending', 'waiter')],
      ),
    )

    expect(state.get('waiter')).toBe('blocked')
  })

  it('clears as soon as every blocker is Done — there is no field to go stale', () => {
    const state = blockedStateFor(
      chart(
        [node('one', 'Done'), node('two', 'Done'), node('waiter')],
        [edge('one', 'waiter'), edge('two', 'waiter')],
      ),
    )

    expect(state.get('waiter')).toBe('none')
  })

  it('calls every node in a cycle unresolvable', () => {
    const state = blockedStateFor(
      chart([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'a'), edge('b', 'c')]),
    )

    expect(state.get('a')).toBe('unresolvable')
    expect(state.get('b')).toBe('unresolvable')
    // Behind the loop but not in it: blocked, which is the honest, lesser thing.
    expect(state.get('c')).toBe('blocked')
  })

  it('calls a node unresolvable even when its blockers are all Done', () => {
    // Done-ness cannot rescue a plan that waits on itself.
    const state = blockedStateFor(
      chart([node('a', 'Done'), node('b', 'Done')], [edge('a', 'b'), edge('b', 'a')]),
    )

    expect(state.get('a')).toBe('unresolvable')
    expect(state.get('b')).toBe('unresolvable')
  })

  it('answers for every node in the chart, edges or none', () => {
    const state = blockedStateFor(chart([node('lonely')]))

    expect([...state]).toEqual([['lonely', 'none']])
  })
})
