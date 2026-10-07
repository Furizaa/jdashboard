import type {
  ExplainActivityLine,
  ExplainPhase,
  ExplainReport,
  ExplainRunEvent,
  ExplainTab,
} from '~/kernel'
import { initialState, reduce, type ExplainEvent, type ExplainState } from '../explain-state'

// Shared by `explain-state.test.ts` and `explain-display.test.ts`, which test the
// two halves of the view-model against the same world: one report, one tab
// builder, and the event constructors that keep a fold readable.

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
export {
  ALL_PHASES,
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
}
