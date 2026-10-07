import { describe, expect, it } from 'vitest'
import type { ExplainRunEvent } from '~/kernel'
import {
  hasTab,
  initialState,
  isTerminalPhase,
  neighbourAfterClose,
  reduce,
  rememberedMove,
  streamingRun,
} from './explain-state'
import {
  ALL_PHASES,
  REPORT,
  line,
  loadedWith,
  openMove,
  requested,
  run,
  select,
  streamed,
  tab,
} from './__fixtures__/explain-state'

// Pure call/assert over the reducer (ADR-0003). Nothing here renders, and the
// table over event × phase is what makes "a new phase is a compile error until
// every arm handles it" a checked claim rather than a hope.

/** A tab with a finished report, for the remembered-move rule (ADR-0010). */
const reported = (iid: number) =>
  tab({ iid, phase: 'report', runId: null, report: REPORT, generatedAt: '2026-10-01T09:11:00Z' })

describe('isTerminalPhase', () => {
  it.each([
    ['preparing', false],
    ['running', false],
    ['report', true],
    ['failed', true],
    ['interrupted', true],
  ] as const)('%s → %s', (phase, expected) => {
    expect(isTerminalPhase(phase)).toBe(expected)
  })
})

describe('tabsLoaded', () => {
  it('takes the server snapshot as the open set', () => {
    const state = run(loadedWith(tab({ iid: 1 }), tab({ iid: 2 })))
    expect(state.tabs.map((t) => t.iid)).toEqual([1, 2])
    expect(state.loaded).toBe(true)
  })

  it('distinguishes "not loaded" from "no tabs"', () => {
    expect(initialState.loaded).toBe(false)
    expect(run(loadedWith()).loaded).toBe(true)
  })

  it('seeds the live overlay from a tab that has a run', () => {
    const state = run(loadedWith(tab({ iid: 1, runId: 'run-1', activity: [line(0)] })))
    expect(state.live[1]).toMatchObject({ runId: 'run-1', phase: 'running' })
    expect(state.live[1]?.activity).toHaveLength(1)
  })

  it('keeps an overlay whose run the server still agrees with', () => {
    const before = run(
      loadedWith(tab({ iid: 1 })),
      streamed(1, 'run-1', { kind: 'activity', line: line(0) }),
    )
    const after = reduce(before, loadedWith(tab({ iid: 1, runId: 'run-1' })))
    expect(after.live[1]?.activity).toHaveLength(1)
  })

  it('drops an overlay the server has superseded with a new run', () => {
    // A stale overlay would outlive the thing it described.
    const before = run(
      loadedWith(tab({ iid: 1 })),
      streamed(1, 'run-1', { kind: 'activity', line: line(0) }),
    )
    const after = reduce(before, loadedWith(tab({ iid: 1, runId: 'run-2' })))
    expect(after.live[1]).toMatchObject({ runId: 'run-2' })
    expect(after.live[1]?.activity).toEqual([])
  })

  it('drops an overlay for a tab that is gone', () => {
    const before = run(loadedWith(tab({ iid: 1 })))
    expect(reduce(before, loadedWith()).live[1]).toBeUndefined()
  })

  it('keeps no overlay for a tab with no run', () => {
    const state = run(loadedWith(tab({ iid: 1, runId: null, phase: 'report', report: REPORT })))
    expect(state.live[1]).toBeUndefined()
  })
})

describe('runRequested', () => {
  it('marks the MR as starting, before the call that creates its run', () => {
    expect(run(requested(7)).starting.has(7)).toBe(true)
  })

  it('clears a previous start failure, so a retry is not read as the old error', () => {
    const state = run({ type: 'startFailed', iid: 7, message: 'no such MR' }, requested(7))
    expect(state.startErrors[7]).toBeUndefined()
  })

  it('is cleared by the run it asked for', () => {
    expect(run(requested(7), { type: 'runStarted', tab: tab({ iid: 7 }) }).starting.has(7)).toBe(
      false,
    )
  })

  it('is cleared by a start that failed', () => {
    const state = run(requested(7), { type: 'startFailed', iid: 7, message: 'no such MR' })
    expect(state.starting.has(7)).toBe(false)
  })

  it('is cleared by closing the tab out from under the start', () => {
    const state = run(loadedWith(tab({ iid: 7 })), requested(7), { type: 'closed', iid: 7 })
    expect(state.starting.has(7)).toBe(false)
  })
})

describe('runStarted', () => {
  it('appends the tab and selects it, before any refetch', () => {
    // A ten-minute run must not start invisibly.
    const state = run(loadedWith(), {
      type: 'runStarted',
      tab: tab({ iid: 7, phase: 'preparing' }),
    })
    expect(state.tabs.map((t) => t.iid)).toEqual([7])
    expect(state.selected).toBe(7)
    expect(state.live[7]).toMatchObject({ phase: 'preparing' })
  })

  it('replaces the tab for an MR that already had one — a re-run', () => {
    const state = run(
      loadedWith(tab({ iid: 7, phase: 'report', report: REPORT, runId: 'run-1' })),
      {
        type: 'runStarted',
        tab: tab({ iid: 7, runId: 'run-2', phase: 'preparing', headSha: 'new' }),
      },
    )
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]).toMatchObject({ runId: 'run-2', headSha: 'new' })
    expect(state.live[7]).toMatchObject({ runId: 'run-2', report: null })
  })

  it('clears a previous start failure for that MR', () => {
    const state = run(
      loadedWith(),
      { type: 'startFailed', iid: 7, message: 'no such MR' },
      { type: 'runStarted', tab: tab({ iid: 7 }) },
    )
    expect(state.startErrors[7]).toBeUndefined()
  })
})

describe('startFailed', () => {
  it('records the message, since there is no stream to carry it', () => {
    const state = run({ type: 'startFailed', iid: 7, message: 'could not read MR !7' })
    expect(state.startErrors[7]).toBe('could not read MR !7')
  })
})

// The event × phase table. Every stream message is applied in every phase, so
// adding either is a compile error until this grid covers it.
describe('streamEvent × phase', () => {
  const EVENTS: ReadonlyArray<readonly [string, ExplainRunEvent]> = [
    ['phase→running', { kind: 'phase', phase: 'running' }],
    ['activity', { kind: 'activity', line: line(0) }],
    ['report', { kind: 'report', report: REPORT }],
    ['failed', { kind: 'failed', message: 'boom' }],
  ]

  it.each(
    ALL_PHASES.flatMap((phase) => EVENTS.map(([name, event]) => [phase, name, event] as const)),
  )('applies %s + %s without losing the run', (phase, _name, event) => {
    const state = run(
      loadedWith(tab({ iid: 1, phase, runId: 'run-1' })),
      streamed(1, 'run-1', event),
    )
    expect(state.live[1]).not.toBeUndefined()
    expect(ALL_PHASES).toContain(state.live[1]?.phase)
  })

  it('sets the phase a phase message names', () => {
    const state = run(
      loadedWith(tab({ iid: 1, phase: 'preparing' })),
      streamed(1, 'run-1', { kind: 'phase', phase: 'running' }),
    )
    expect(state.live[1]?.phase).toBe('running')
  })

  it('appends an activity line', () => {
    const state = run(
      loadedWith(tab({ iid: 1 })),
      streamed(1, 'run-1', { kind: 'activity', line: line(0) }),
      streamed(1, 'run-1', { kind: 'activity', line: line(1) }),
    )
    expect(state.live[1]?.activity.map((l) => l.seq)).toEqual([0, 1])
  })

  it('deduplicates by seq, because the endpoint replays before it subscribes', () => {
    const state = run(
      loadedWith(tab({ iid: 1 })),
      streamed(1, 'run-1', { kind: 'activity', line: line(0) }),
      streamed(1, 'run-1', { kind: 'activity', line: line(0) }),
    )
    expect(state.live[1]?.activity).toHaveLength(1)
  })

  it('a report message carries the phase with it', () => {
    const state = run(
      loadedWith(tab({ iid: 1 })),
      streamed(1, 'run-1', { kind: 'report', report: REPORT }),
    )
    expect(state.live[1]).toMatchObject({ phase: 'report', error: null })
    expect(state.live[1]?.report).toEqual(REPORT)
  })

  it('a failed message carries the phase and the reason', () => {
    const state = run(
      loadedWith(tab({ iid: 1 })),
      streamed(1, 'run-1', { kind: 'failed', message: 'no such ref' }),
    )
    expect(state.live[1]).toMatchObject({ phase: 'failed', error: 'no such ref' })
  })

  it('ignores a message for a run the tab has since replaced', () => {
    // The runId guard is what makes a re-run safe: a late message from the old
    // run must not be applied to its successor.
    const state = run(
      loadedWith(tab({ iid: 1, runId: 'run-2' })),
      streamed(1, 'run-1', { kind: 'failed', message: 'from the old run' }),
    )
    expect(state.live[1]?.error).toBeNull()
  })

  it('seeds an overlay for a message that arrives before the snapshot', () => {
    const state = run(streamed(1, 'run-1', { kind: 'phase', phase: 'running' }))
    expect(state.live[1]).toMatchObject({ runId: 'run-1', phase: 'running' })
  })
})

describe('streamLost', () => {
  it.each(['preparing', 'running'] as const)('reads a drop during %s as interrupted', (phase) => {
    const state = run(loadedWith(tab({ iid: 1, phase })), {
      type: 'streamLost',
      iid: 1,
      runId: 'run-1',
    })
    expect(state.live[1]?.phase).toBe('interrupted')
  })

  it.each(['report', 'failed', 'interrupted'] as const)(
    'ignores a drop once the run is over (%s)',
    (phase) => {
      const state = run(
        loadedWith(tab({ iid: 1, phase, report: phase === 'report' ? REPORT : null })),
        { type: 'streamLost', iid: 1, runId: 'run-1' },
      )
      expect(state.live[1]?.phase).toBe(phase)
    },
  )

  it('ignores a drop reported for a run that has been replaced', () => {
    const state = run(loadedWith(tab({ iid: 1, runId: 'run-2' })), {
      type: 'streamLost',
      iid: 1,
      runId: 'run-1',
    })
    expect(state.live[1]?.phase).toBe('running')
  })

  it('ignores a drop for an MR with no overlay at all', () => {
    const state = run({ type: 'streamLost', iid: 9, runId: 'run-1' })
    expect(state.live[9]).toBeUndefined()
  })
})

describe('closing', () => {
  it('opens and dismisses the confirmation', () => {
    const asked = run(loadedWith(tab({ iid: 1 })), { type: 'closeRequested', iid: 1 })
    expect(asked.closing).toBe(1)
    expect(reduce(asked, { type: 'closeDismissed' }).closing).toBeNull()
  })

  it('removes the tab and its overlay on close', () => {
    const state = run(
      loadedWith(tab({ iid: 1 }), tab({ iid: 2 })),
      { type: 'closeRequested', iid: 1 },
      { type: 'closed', iid: 1 },
    )
    expect(state.tabs.map((t) => t.iid)).toEqual([2])
    expect(state.live[1]).toBeUndefined()
    expect(state.closing).toBeNull()
  })

  it('selects the next tab rather than dropping onto the empty surface', () => {
    const state = run(loadedWith(tab({ iid: 1 }), tab({ iid: 2 }), tab({ iid: 3 })), select(2), {
      type: 'closed',
      iid: 2,
    })
    expect(state.selected).toBe(3)
  })

  it('falls back to the previous tab when the closed one was last', () => {
    const state = run(loadedWith(tab({ iid: 1 }), tab({ iid: 2 })), select(2), {
      type: 'closed',
      iid: 2,
    })
    expect(state.selected).toBe(1)
  })

  it('selects nothing when the last tab closes', () => {
    const state = run(loadedWith(tab({ iid: 1 })), select(1), { type: 'closed', iid: 1 })
    expect(state.selected).toBeNull()
  })

  it('leaves the selection alone when another tab closes', () => {
    const state = run(loadedWith(tab({ iid: 1 }), tab({ iid: 2 })), select(1), {
      type: 'closed',
      iid: 2,
    })
    expect(state.selected).toBe(1)
  })

  it('clears a start failure for the closed MR', () => {
    const state = run(
      loadedWith(tab({ iid: 1 })),
      { type: 'startFailed', iid: 1, message: 'boom' },
      { type: 'closed', iid: 1 },
    )
    expect(state.startErrors[1]).toBeUndefined()
  })
})

describe('neighbourAfterClose', () => {
  it('is the next tab, then the previous, then nothing', () => {
    const state = run(loadedWith(tab({ iid: 1 }), tab({ iid: 2 })))
    expect(neighbourAfterClose(state, 1)).toBe(2)
    expect(neighbourAfterClose(state, 2)).toBe(1)
    expect(neighbourAfterClose(run(loadedWith(tab({ iid: 1 }))), 1)).toBeNull()
  })

  it('has no answer for a tab that is not open', () => {
    expect(neighbourAfterClose(run(loadedWith()), 9)).toBeNull()
  })
})

describe('streamingRun', () => {
  it('is the selected tab’s run while it is in flight', () => {
    const state = run(loadedWith(tab({ iid: 1, runId: 'run-1' })), select(1))
    expect(streamingRun(state)).toEqual({ iid: 1, runId: 'run-1' })
  })

  it('is nothing with no selection', () => {
    expect(streamingRun(run(loadedWith(tab({ iid: 1 }))))).toBeNull()
  })

  it('is nothing for a tab with no run', () => {
    const state = run(loadedWith(tab({ iid: 1, runId: null, phase: 'interrupted' })), select(1))
    expect(streamingRun(state)).toBeNull()
  })

  it('stops once the run is over — the report is already in hand', () => {
    const state = run(
      loadedWith(tab({ iid: 1, runId: 'run-1' })),
      select(1),
      streamed(1, 'run-1', { kind: 'report', report: REPORT }),
    )
    expect(streamingRun(state)).toBeNull()
  })

  it('does not watch a snapshot that is already terminal', () => {
    const state = run(
      loadedWith(tab({ iid: 1, runId: 'run-1', phase: 'failed', error: 'boom' })),
      select(1),
    )
    expect(streamingRun(state)).toBeNull()
  })

  it('watches the successor after a re-run', () => {
    const state = run(
      loadedWith(tab({ iid: 1, runId: 'run-1' })),
      select(1),
      streamed(1, 'run-1', { kind: 'report', report: REPORT }),
      { type: 'runStarted', tab: tab({ iid: 1, runId: 'run-2', phase: 'preparing' }) },
    )
    expect(streamingRun(state)).toEqual({ iid: 1, runId: 'run-2' })
  })
})

describe('hasTab', () => {
  it('answers the start-on-arrival question', () => {
    const state = run(loadedWith(tab({ iid: 1 })))
    expect(hasTab(state, 1)).toBe(true)
    expect(hasTab(state, 2)).toBe(false)
  })
})

describe('the remembered move', () => {
  it('remembers the move last read in each tab', () => {
    const state = run(
      loadedWith(reported(1), reported(2)),
      select(1),
      openMove(1, 'legacy-helper-deleted'),
      select(2),
      openMove(2, 'rounding-leaves-pricing'),
    )
    expect(rememberedMove(state, 1)).toBe('legacy-helper-deleted')
    expect(rememberedMove(state, 2)).toBe('rounding-leaves-pricing')
  })

  it('has nothing to remember for a tab that was only ever on Overview', () => {
    const state = run(loadedWith(reported(1)), select(1), openMove(1, null))
    expect(rememberedMove(state, 1)).toBeNull()
  })

  it('forgets a move once its tab is closed', () => {
    const state = run(
      loadedWith(reported(1), reported(2)),
      select(1),
      openMove(1, 'legacy-helper-deleted'),
      { type: 'closed', iid: 1 },
    )
    expect(rememberedMove(state, 1)).toBeNull()
    // And the closed tab's move must not linger as the neighbour's selection.
    expect(state.selectedMove).toBeNull()
  })

  it('keeps the selection when a tab other than the selected one is closed', () => {
    const state = run(
      loadedWith(reported(1), reported(2)),
      select(2),
      openMove(2, 'legacy-helper-deleted'),
      { type: 'closed', iid: 1 },
    )
    expect(state.selectedMove).toBe('legacy-helper-deleted')
  })
})
