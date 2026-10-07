import { describe, expect, it } from 'vitest'
import type {
  ExplainActivityLine,
  ExplainPhase,
  ExplainReport,
  ExplainRunEvent,
  ExplainTab,
} from '~/kernel'
import {
  closeCostsARun,
  deriveExplain,
  hasTab,
  initialState,
  isTerminalPhase,
  neighbourAfterClose,
  reduce,
  rememberedMove,
  streamingRun,
  type ExplainEvent,
  type ExplainState,
} from './explain-view-model'

// Pure call/assert over the reducer and its projection (ADR-0003). Nothing here
// renders, and the table over event × phase is what makes "a new phase is a
// compile error until every arm handles it" a checked claim rather than a hope.

// Two moves, because one would not exercise the rail's numbering or the
// remembered-move rule (ADR-0010).
const REPORT: ExplainReport = {
  version: 2,
  overview: [{ type: 'verdict', verdict: 'sound', headline: 'Fits the system' }],
  moves: [
    {
      id: 'rounding-leaves-pricing',
      title: 'Rounding leaves the pricing service',
      summary: 'The service stops rounding and its callers start.',
      systems: ['pricing', 'checkout'],
      paths: ['src/pricing/quote.ts', 'src/checkout/total.ts'],
      blocks: [
        { type: 'narrative', body: 'It moved.' },
        {
          type: 'finding',
          system: 'pricing',
          title: 'Two owners of one rule',
          severity: 'high',
          whyItMatters: 'They will drift.',
        },
      ],
    },
    {
      id: 'legacy-helper-deleted',
      title: 'The legacy helper is deleted',
      summary: 'Dead once the service stopped calling it.',
      systems: ['legacy-quotes'],
      paths: ['src/legacy-quotes/round.ts'],
      blocks: [{ type: 'narrative', body: 'Gone.' }],
    },
  ],
}

const ALL_PHASES: readonly ExplainPhase[] = [
  'preparing',
  'running',
  'report',
  'failed',
  'interrupted',
]

function tab(overrides: Partial<ExplainTab> & { iid: number }): ExplainTab {
  return {
    iid: overrides.iid,
    title: overrides.title ?? `MR ${overrides.iid}`,
    webUrl: overrides.webUrl ?? `https://gitlab/p/-/merge_requests/${overrides.iid}`,
    sourceBranch: overrides.sourceBranch ?? 'feat/x',
    targetBranch: overrides.targetBranch ?? 'develop',
    headSha: overrides.headSha ?? 'sha-report',
    issueKey: overrides.issueKey ?? null,
    phase: overrides.phase ?? 'running',
    // `??` would eat a deliberate `null`, which is exactly the no-live-run case.
    runId: 'runId' in overrides ? (overrides.runId ?? null) : 'run-1',
    startedAt: overrides.startedAt ?? '2026-10-01T09:00:00.000Z',
    generatedAt: overrides.generatedAt ?? null,
    activity: overrides.activity ?? [],
    report: overrides.report ?? null,
    error: overrides.error ?? null,
    currentHeadSha:
      'currentHeadSha' in overrides ? (overrides.currentHeadSha ?? null) : 'sha-report',
  }
}

const line = (seq: number, text = `step ${seq}`): ExplainActivityLine => ({
  kind: 'read',
  text,
  seq,
  at: 1_000 + seq,
})

/** Fold a sequence of events from the initial state. */
function run(...events: readonly ExplainEvent[]): ExplainState {
  return events.reduce(reduce, initialState)
}

const loadedWith = (...tabs: readonly ExplainTab[]) => ({ type: 'tabsLoaded', tabs }) as const
const select = (iid: number | null) => ({ type: 'selected', iid }) as const
const openMove = (iid: number | null, moveId: string | null) =>
  ({ type: 'moveSelected', iid, moveId }) as const
const streamed = (iid: number, runId: string, event: ExplainRunEvent) =>
  ({ type: 'streamEvent', iid, runId, event }) as const
const requested = (iid: number) => ({ type: 'runRequested', iid }) as const

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

describe('closeCostsARun', () => {
  it.each([
    ['report', true],
    ['preparing', true],
    ['running', true],
    ['failed', false],
    ['interrupted', false],
  ] as const)('%s → %s', (phase, expected) => {
    expect(closeCostsARun(tab({ iid: 1, phase }), undefined)).toBe(expected)
  })

  it('asks the live overlay, not the stale snapshot', () => {
    expect(
      closeCostsARun(tab({ iid: 1, phase: 'report', report: REPORT }), {
        runId: 'run-2',
        phase: 'running',
        activity: [],
        report: null,
        error: null,
      }),
    ).toBe(true)
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

describe('deriveExplain — the tab strip', () => {
  it('labels a tab with the MR, and the ticket when there is one', () => {
    const display = deriveExplain(
      run(loadedWith(tab({ iid: 4211, issueKey: 'HDR-7' }), tab({ iid: 9, issueKey: null }))),
    )
    expect(display.tabs.map((t) => t.label)).toEqual(['!4211 · HDR-7', '!9'])
  })

  it('marks the selected tab and spins the busy ones', () => {
    const display = deriveExplain(
      run(
        loadedWith(
          tab({ iid: 1, phase: 'running' }),
          tab({ iid: 2, phase: 'report', report: REPORT }),
        ),
        select(2),
      ),
    )
    expect(display.tabs.map((t) => t.isSelected)).toEqual([false, true])
    expect(display.tabs.map((t) => t.isBusy)).toEqual([true, false])
  })

  it('takes a tab’s phase from the live overlay', () => {
    const display = deriveExplain(
      run(
        loadedWith(tab({ iid: 1, phase: 'preparing' })),
        streamed(1, 'run-1', { kind: 'phase', phase: 'running' }),
      ),
    )
    expect(display.tabs[0]?.phase).toBe('running')
  })
})

describe('deriveExplain — the pane', () => {
  it('shows nothing before the snapshot arrives', () => {
    // "No reviews open" must not flash while the first read is in flight.
    expect(deriveExplain(initialState).pane).toEqual({ kind: 'loading' })
  })

  it('shows the empty surface when nothing is open', () => {
    expect(deriveExplain(run(loadedWith())).pane).toEqual({ kind: 'no-tabs' })
  })

  it('asks for a selection when tabs are open but none is chosen', () => {
    expect(deriveExplain(run(loadedWith(tab({ iid: 1 }), tab({ iid: 2 })))).pane).toEqual({
      kind: 'none-selected',
      count: 2,
    })
  })

  it.each(['preparing', 'running'] as const)('shows the activity log while %s', (phase) => {
    const display = deriveExplain(
      run(loadedWith(tab({ iid: 1, phase, activity: [line(0)] })), select(1)),
    )
    expect(display.pane).toMatchObject({ kind: 'working', phase, iid: 1 })
  })

  it('shows the report, laid out, once it lands', () => {
    const display = deriveExplain(
      run(
        loadedWith(
          tab({
            iid: 1,
            phase: 'report',
            runId: null,
            report: REPORT,
            generatedAt: '2026-10-01T09:11:00.000Z',
          }),
        ),
        select(1),
      ),
    )
    expect(display.pane).toMatchObject({
      kind: 'report',
      iid: 1,
      generatedAt: '2026-10-01T09:11:00.000Z',
      freshness: null,
    })
    if (display.pane.kind !== 'report') return
    // Overview is pinned first and is where the reader lands (ADR-0010 §2).
    expect(display.pane.page).toMatchObject({ kind: 'overview' })
    expect(display.pane.rail.map((entry) => entry.kind)).toEqual(['overview', 'move', 'move'])
  })

  it('warns on a report whose MR has moved on', () => {
    const display = deriveExplain(
      run(
        loadedWith(
          tab({
            iid: 1,
            phase: 'report',
            runId: null,
            report: REPORT,
            headSha: 'aaaaaaaaaa',
            currentHeadSha: 'bbbbbbbbbb',
          }),
        ),
        select(1),
      ),
    )
    expect(display.pane).toMatchObject({ kind: 'report' })
    if (display.pane.kind !== 'report') return
    expect(display.pane.freshness).toContain('moved on')
  })

  it('reads a report phase with no report yet as still working', () => {
    // The phase and the payload arrive as two messages, so the in-between state
    // is representable — and must not render as an empty report.
    const display = deriveExplain(
      run(
        loadedWith(tab({ iid: 1 })),
        select(1),
        streamed(1, 'run-1', { kind: 'phase', phase: 'report' }),
      ),
    )
    expect(display.pane.kind).toBe('working')
  })

  it('shows a failure with its reason', () => {
    const display = deriveExplain(
      run(
        loadedWith(tab({ iid: 1 })),
        select(1),
        streamed(1, 'run-1', { kind: 'failed', message: 'no such ref' }),
      ),
    )
    expect(display.pane).toMatchObject({ kind: 'failed', message: 'no such ref' })
  })

  it('shows a start failure, which never had a run to fail', () => {
    const display = deriveExplain(
      run(loadedWith(tab({ iid: 1 })), select(1), {
        type: 'startFailed',
        iid: 1,
        message: 'could not read MR !1',
      }),
    )
    expect(display.pane).toMatchObject({ kind: 'failed', message: 'could not read MR !1' })
  })

  it('shows an interrupted tab — the dev-server-restart case', () => {
    const display = deriveExplain(
      run(loadedWith(tab({ iid: 1, phase: 'interrupted', runId: null })), select(1)),
    )
    expect(display.pane).toMatchObject({ kind: 'interrupted', iid: 1 })
  })

  it('says it is starting when the URL names an MR that has no tab yet', () => {
    // The Detail / palette hand-off: the surface starts the run on arrival, and
    // until it has one there is no tab. "No reviews open" would read as a bug.
    expect(deriveExplain(run(loadedWith(tab({ iid: 1 })), select(99))).pane).toEqual({
      kind: 'starting',
      iid: 99,
      title: null,
    })
  })

  it('says it is starting while a re-run is being asked for, naming the MR', () => {
    const display = deriveExplain(
      run(
        loadedWith(tab({ iid: 1, title: 'Move rounding', phase: 'report', report: REPORT })),
        select(1),
        requested(1),
      ),
    )
    // A re-run throws the old report away as it begins, so showing it for the
    // length of the call would be showing a report of a tree we have left.
    expect(display.pane).toEqual({ kind: 'starting', iid: 1, title: 'Move rounding' })
  })

  it('shows a start failure for an MR that never got a tab', () => {
    const display = deriveExplain(
      run(loadedWith(), select(99), requested(99), {
        type: 'startFailed',
        iid: 99,
        message: 'could not read merge request !99',
      }),
    )
    expect(display.pane).toMatchObject({
      kind: 'failed',
      iid: 99,
      message: 'could not read merge request !99',
    })
  })

  it('still shows nothing before the snapshot arrives, even with an MR selected', () => {
    // "Starting" is only honest once we know the MR has no tab.
    expect(deriveExplain(run(select(99))).pane).toEqual({ kind: 'loading' })
  })
})

describe('deriveExplain — the close confirmation', () => {
  it('is absent until a close is requested', () => {
    expect(deriveExplain(run(loadedWith(tab({ iid: 1 })))).closing).toBeNull()
  })

  it('names the tab and says whether confirming costs a run', () => {
    const display = deriveExplain(
      run(loadedWith(tab({ iid: 1, title: 'Move rounding' })), { type: 'closeRequested', iid: 1 }),
    )
    expect(display.closing).toEqual({ iid: 1, title: 'Move rounding', costsARun: true })
  })

  it('is absent for a tab that closed before the dialog opened', () => {
    const display = deriveExplain(
      run(loadedWith(tab({ iid: 1 })), { type: 'closeRequested', iid: 1 }, loadedWith()),
    )
    expect(display.closing).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Moves: the rail, the page, and the remembered selection (ADR-0010)
// ---------------------------------------------------------------------------

/** A tab with a finished report, which is the only state a rail exists in. */
const reported = (iid: number) =>
  tab({ iid, phase: 'report', runId: null, report: REPORT, generatedAt: '2026-10-01T09:11:00Z' })

function railOf(state: ExplainState) {
  const { pane } = deriveExplain(state)
  if (pane.kind !== 'report') throw new Error(`expected a report pane, got ${pane.kind}`)
  return pane
}

describe('the move rail', () => {
  it('lists Overview first, then every move in the agent’s own order', () => {
    const { rail } = railOf(run(loadedWith(reported(1)), select(1)))
    expect(rail).toEqual([
      { kind: 'overview', isSelected: true, verdict: 'sound', moveCount: 2 },
      {
        kind: 'move',
        id: 'rounding-leaves-pricing',
        position: 1,
        title: 'Rounding leaves the pricing service',
        summary: 'The service stops rounding and its callers start.',
        systems: ['pricing', 'checkout'],
        fileCount: 2,
        findingCount: 1,
        severity: 'high',
        isSelected: false,
      },
      {
        kind: 'move',
        id: 'legacy-helper-deleted',
        position: 2,
        title: 'The legacy helper is deleted',
        summary: 'Dead once the service stopped calling it.',
        systems: ['legacy-quotes'],
        fileCount: 1,
        findingCount: 0,
        // No findings means no dot — not a reassuring green one.
        severity: null,
        isSelected: false,
      },
    ])
  })

  it('marks the selected move and deselects Overview', () => {
    const { rail } = railOf(
      run(loadedWith(reported(1)), select(1), openMove(1, 'legacy-helper-deleted')),
    )
    expect(rail.map((entry) => entry.isSelected)).toEqual([false, false, true])
  })
})

describe('the notebook page', () => {
  it('opens the move the URL names', () => {
    const { page } = railOf(
      run(loadedWith(reported(1)), select(1), openMove(1, 'rounding-leaves-pricing')),
    )
    expect(page).toMatchObject({
      kind: 'move',
      id: 'rounding-leaves-pricing',
      position: 1,
      total: 2,
      paths: ['src/pricing/quote.ts', 'src/checkout/total.ts'],
      severity: 'high',
    })
  })

  it('falls back to Overview for a move the report does not contain', () => {
    // A shared link can outlive the report it was written against, and a re-run
    // has no obligation to find the same moves.
    const { page, rail } = railOf(run(loadedWith(reported(1)), select(1), openMove(1, 'long-gone')))
    expect(page.kind).toBe('overview')
    expect(rail[0]).toMatchObject({ kind: 'overview', isSelected: true })
  })

  it('lays out each page’s cells independently, worst finding first', () => {
    const twoFindings: ExplainReport = {
      ...REPORT,
      moves: [
        {
          ...REPORT.moves[0]!,
          blocks: [
            { type: 'narrative', body: 'Intro.' },
            {
              type: 'finding',
              system: 'pricing',
              title: 'Low',
              severity: 'low',
              whyItMatters: 'Minor.',
            },
            {
              type: 'finding',
              system: 'pricing',
              title: 'High',
              severity: 'high',
              whyItMatters: 'Major.',
            },
          ],
        },
      ],
    }
    const { page } = railOf(
      run(
        loadedWith(tab({ iid: 1, phase: 'report', runId: null, report: twoFindings })),
        select(1),
        openMove(1, 'rounding-leaves-pricing'),
      ),
    )
    // The narrative that introduces them stays above them; the findings are
    // re-ordered in place.
    expect(page.blocks.map((block) => block.type)).toEqual(['narrative', 'finding', 'finding'])
    expect(page.blocks[1]).toMatchObject({ title: 'High' })
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
