// One Explain run: its lifecycle, the shape a reader sees of it, the deps it
// needs, and the steps that advance it. The *registry* of runs — the process
// map, the concurrency queue, and start/read/close — is `explain-runs.ts`.
//
// This module also owns the **translation**: each raw `stream-json` event becomes
// one coarse activity line via `activityFor`, and raw events never reach the
// browser. A CLI output-format change therefore breaks `explain-agent.ts` and
// this file, and nothing downstream.
//
// A **plain dependency-injected module, not an Effect service**, for the reason
// `notes-store.ts` states for local file I/O: this is local process state with no
// external system, and injected deps make it unit-testable with a fake runner, a
// fake clock, and a fake store (ADR-0009 §4).

import { activityFor, type ExplainActivity, type ExplainTicketContext } from './explain-agent'
import type { ClaudeStreamEvent } from './claude-cli'
import type { ExplainReport } from './explain-report'
import type { ExplainRecord, ExplainTarget } from './explain-store'

export type { ExplainTarget } from './explain-store'

/**
 * The read-only context one run's prompt is built from, gathered by the caller
 * *before* the run starts and forwarded untouched. It is handed in rather than
 * fetched here so the registry needs no gateway, no Effect runtime, and no
 * network — which is what keeps it a plain unit-testable module (ADR-0009 §4).
 *
 * Everything the `target` already carries (iid, title, branches, head SHA) is
 * deliberately absent: this is only what the target does not say.
 */
export type ExplainRunContext = {
  readonly mrDescription: string
  readonly mrDiscussions: string
  readonly ticket: ExplainTicketContext
}

/**
 * One run's lifecycle.
 *
 *   preparing ─► running ─► report
 *        │           │
 *        ├───────────┼────► failed        (the agent, or the checkout, lost)
 *        └───────────┴────► interrupted   (stopped without a verdict)
 *
 * `interrupted` is reached two ways, and they mean the same thing to the reader:
 * a run aborted in flight (superseded by a re-run, or cancelled), and a *pending
 * record with no live run* — which is what a dev-server restart under a run in
 * flight leaves behind. Either way the tab reads "interrupted — re-run".
 */
export const EXPLAIN_PHASES = ['preparing', 'running', 'report', 'failed', 'interrupted'] as const
export type ExplainPhase = (typeof EXPLAIN_PHASES)[number]

/** An activity line plus its place in the stream, so a reconnect can resume. */
export type ExplainActivityLine = ExplainActivity & {
  readonly seq: number
  /** Epoch millis from the injected clock. */
  readonly at: number
}

/** What a reader (RPC or SSE) sees of one run. */
export type ExplainRunView = {
  readonly runId: string
  readonly iid: number
  readonly phase: ExplainPhase
  readonly target: ExplainTarget
  readonly activity: readonly ExplainActivityLine[]
  readonly report: ExplainReport | null
  readonly error: string | null
  readonly startedAt: number
  readonly finishedAt: number | null
}

/**
 * What goes down the SSE channel. One message is one activity line or one phase
 * change, and the terminal message carries the report or the failure — which is
 * exactly ADR-0009 §4's contract.
 */
export type ExplainRunEvent =
  | { readonly kind: 'phase'; readonly phase: ExplainPhase }
  | { readonly kind: 'activity'; readonly line: ExplainActivityLine }
  | { readonly kind: 'report'; readonly report: ExplainReport }
  | { readonly kind: 'failed'; readonly message: string }

export type ExplainRunListener = (event: ExplainRunEvent) => void

/** The agent's outcome, already parsed and validated by the caller's runner. */
export type ExplainAgentOutcome =
  | { readonly ok: true; readonly report: ExplainReport }
  | { readonly ok: false; readonly message: string }

export type ExplainRunsDeps = {
  /** Fetch the MR ref and check its head out into a detached worktree. */
  readonly prepare: (
    target: ExplainTarget,
  ) => Promise<
    | { readonly ok: true; readonly worktreePath: string }
    | { readonly ok: false; readonly message: string }
  >
  /**
   * Build the prompt, run the agent in the worktree, parse its reply. Raw CLI
   * events come back through `onEvent` so the registry can translate them; the
   * outcome is already a report or a message.
   */
  readonly runAgent: (input: {
    readonly target: ExplainTarget
    readonly context: ExplainRunContext
    readonly worktreePath: string
    readonly onEvent: (event: ClaudeStreamEvent) => void
    readonly signal: AbortSignal
  }) => Promise<ExplainAgentOutcome>
  /** Persist the tab. Called once at start (pending) and once at the end. */
  readonly persist: (record: ExplainRecord) => Promise<void>
  readonly now: () => number
  readonly newRunId: () => string
}

/** One run as the registry holds it: the view's fields, plus the mutable ones. */
export type Run = {
  readonly runId: string
  readonly target: ExplainTarget
  readonly context: ExplainRunContext
  readonly startedAt: number
  phase: ExplainPhase
  activity: ExplainActivityLine[]
  report: ExplainReport | null
  error: string | null
  finishedAt: number | null
  worktreePath: string | null
  readonly controller: AbortController
  readonly listeners: Set<ExplainRunListener>
}

export function viewOf(run: Run): ExplainRunView {
  return {
    runId: run.runId,
    iid: run.target.iid,
    phase: run.phase,
    target: run.target,
    activity: run.activity,
    report: run.report,
    error: run.error,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }
}

export const isTerminal = (phase: ExplainPhase): boolean =>
  phase === 'report' || phase === 'failed' || phase === 'interrupted'

/**
 * Deliver one event to a run's subscribers.
 *
 * A listener that throws must not take the run — or the other listeners — down
 * with it. The stream is a view onto the run, never a participant.
 *
 * The copy is deliberate: a listener may unsubscribe (or subscribe) from inside
 * its own callback — `close()` on a terminal event does exactly that — and this
 * delivery should be to the set as it stood when the event fired.
 */
export function emit(run: Run, event: ExplainRunEvent): void {
  // oxlint-disable-next-line no-useless-spread -- see the doc comment above
  for (const listener of [...run.listeners]) {
    try {
      listener(event)
    } catch {
      // a dead subscriber is dropped on its next write, not here
    }
  }
}

export function setPhase(deps: ExplainRunsDeps, run: Run, phase: ExplainPhase): void {
  if (run.phase === phase) return
  run.phase = phase
  if (isTerminal(phase)) run.finishedAt = deps.now()
  emit(run, { kind: 'phase', phase })
}

function addActivity(deps: ExplainRunsDeps, run: Run, activity: ExplainActivity): void {
  const line: ExplainActivityLine = { ...activity, seq: run.activity.length, at: deps.now() }
  run.activity.push(line)
  emit(run, { kind: 'activity', line })
}

const recordFor = (deps: ExplainRunsDeps, run: Run): ExplainRecord => ({
  ...run.target,
  version: 1,
  startedAt: new Date(run.startedAt).toISOString(),
  generatedAt: run.report === null ? null : new Date(deps.now()).toISOString(),
  report: run.report,
})

/**
 * Persistence must never fail a run: the report is in memory and on the stream
 * either way, and a disk problem is the user's to notice, not a reason to throw
 * away ten minutes of work.
 */
export function persistQuietly(deps: ExplainRunsDeps, run: Run): void {
  deps.persist(recordFor(deps, run)).catch((error: unknown) => {
    console.error(
      `[explain] could not persist the report for !${run.target.iid}:`,
      error instanceof Error ? error.message : error,
    )
  })
}

function failRun(deps: ExplainRunsDeps, run: Run, message: string): void {
  run.error = message
  setPhase(deps, run, 'failed')
  emit(run, { kind: 'failed', message })
}

/**
 * Walk one run from `preparing` to a terminal phase: check the head out, run the
 * agent, translate its events, then report or fail. Aborts are silent by design —
 * the aborter has already said what happened (superseded, cancelled, closed).
 *
 * It never throws: a throw from a dep is a bug in the dep, not a reason to lose
 * the tab. The caller's concurrency slot is therefore safe to release on the
 * settled promise.
 */
export async function execute(deps: ExplainRunsDeps, run: Run): Promise<void> {
  try {
    const prepared = await deps.prepare(run.target)
    if (run.controller.signal.aborted) return
    if (!prepared.ok) {
      failRun(deps, run, prepared.message)
      return
    }
    run.worktreePath = prepared.worktreePath

    setPhase(deps, run, 'running')
    const outcome = await deps.runAgent({
      target: run.target,
      context: run.context,
      worktreePath: prepared.worktreePath,
      onEvent: (event) => {
        const activity = activityFor(event, { worktreePath: prepared.worktreePath })
        if (activity !== null) addActivity(deps, run, activity)
      },
      signal: run.controller.signal,
    })
    if (run.controller.signal.aborted) return

    if (!outcome.ok) {
      failRun(deps, run, outcome.message)
      return
    }
    run.report = outcome.report
    setPhase(deps, run, 'report')
    emit(run, { kind: 'report', report: outcome.report })
    persistQuietly(deps, run)
  } catch (error: unknown) {
    if (!run.controller.signal.aborted) {
      failRun(
        deps,
        run,
        error instanceof Error ? error.message : 'the explain run failed unexpectedly',
      )
    }
  }
}
