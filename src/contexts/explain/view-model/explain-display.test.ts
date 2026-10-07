import { describe, expect, it } from 'vitest'
import type { ExplainReport } from '~/kernel'
import { closeCostsARun, deriveExplain } from './explain-display'
import { type ExplainState } from './explain-state'
import {
  REPORT,
  initialState,
  line,
  loadedWith,
  openMove,
  requested,
  run,
  select,
  streamed,
  tab,
} from './__fixtures__/explain-state'

// Pure call/assert over the projection (ADR-0003): `ExplainState` in, the shapes
// the views render out. Nothing here renders either — what the surface shows for
// a given state is one function call away.

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
