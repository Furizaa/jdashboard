// The Explain run registry: the process-scoped `runId → run` map, its
// subscribers, and the phase machine one run walks.
//
// A **plain dependency-injected module, not an Effect service**, for the reason
// `notes-store.ts` states for local file I/O: this is local process state with
// no external system, and injected deps make it unit-testable with a fake
// runner, a fake clock, and a fake store (ADR-0009 §4). Upgrade path: swap the
// map for a store.
//
// Why a registry at all, rather than one long `createServerFn` call: the CLI
// caps at three minutes by default and an architect-grade review overruns it; a
// ten-minute HTTP request survives no reload; and the run would be a black box
// for its whole duration, which is the worst property a ten-minute wait can
// have. So start / read / close are ordinary JSON-RPC and **progress is an SSE
// channel** fed from here.
//
// This module also owns the **translation**: each raw `stream-json` event
// becomes one coarse activity line via `activityFor`, and raw events never
// reach the browser. A CLI output-format change therefore breaks
// `explain-agent.ts` and this call site, and nothing downstream.

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

/**
 * Two at a time. The run is heavy — an Opus session reading a repository — and
 * the machine is also the user's. Further starts queue rather than being
 * refused: queueing is invisible except as a slower start, whereas a refusal is
 * a dead end the user has to understand (ADR-0009 §4).
 */
export const MAX_CONCURRENT_RUNS = 2

type Run = {
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

export type ExplainRuns = {
  /**
   * Start a run for one MR, replacing any run already in flight for it (a
   * re-run is what the user asked for). Returns the new run's view.
   */
  readonly startRun: (target: ExplainTarget, context: ExplainRunContext) => ExplainRunView
  readonly getRun: (runId: string) => ExplainRunView | null
  /** The live run for one MR, if there is one. */
  readonly getRunForMr: (iid: number) => ExplainRunView | null
  readonly listRuns: () => readonly ExplainRunView[]
  /**
   * Watch one run. The listener is called for every event from now on; the
   * caller replays `getRun(runId)` first, so nothing is missed between the read
   * and the subscribe. A terminal event is delivered before the run is closed
   * to further subscribers.
   */
  readonly subscribe: (runId: string, listener: ExplainRunListener) => () => void
  /** Kill a run in flight. `false` when there was nothing to kill. */
  readonly abortRun: (runId: string) => boolean
  /** Forget everything in memory about one MR, aborting a run in flight. */
  readonly closeRun: (iid: number) => void
}

function viewOf(run: Run): ExplainRunView {
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

const isTerminal = (phase: ExplainPhase): boolean =>
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
function emit(run: Run, event: ExplainRunEvent): void {
  // oxlint-disable-next-line no-useless-spread -- see the doc comment above
  for (const listener of [...run.listeners]) {
    try {
      listener(event)
    } catch {
      // a dead subscriber is dropped on its next write, not here
    }
  }
}

export function createExplainRuns(deps: ExplainRunsDeps): ExplainRuns {
  const runs = new Map<string, Run>()
  /** Which run is the current one for an MR — a re-run supersedes its predecessor. */
  const currentByMr = new Map<number, string>()
  const queue: string[] = []
  // The runs holding a concurrency slot. A set rather than a counter so a run
  // that is aborted mid-flight cannot return its slot twice: the slot is given
  // back exactly once, by `execute`'s own `finally`.
  const executing = new Set<string>()

  const setPhase = (run: Run, phase: ExplainPhase): void => {
    if (run.phase === phase) return
    run.phase = phase
    if (isTerminal(phase)) run.finishedAt = deps.now()
    emit(run, { kind: 'phase', phase })
  }

  const addActivity = (run: Run, activity: ExplainActivity): void => {
    const line: ExplainActivityLine = {
      ...activity,
      seq: run.activity.length,
      at: deps.now(),
    }
    run.activity.push(line)
    emit(run, { kind: 'activity', line })
  }

  const recordFor = (run: Run): ExplainRecord => ({
    ...run.target,
    version: 1,
    startedAt: new Date(run.startedAt).toISOString(),
    generatedAt: run.report === null ? null : new Date(deps.now()).toISOString(),
    report: run.report,
  })

  // Persistence must never fail a run: the report is in memory and on the
  // stream either way, and a disk problem is the user's to notice, not a reason
  // to throw away ten minutes of work.
  const persistQuietly = (run: Run): void => {
    deps.persist(recordFor(run)).catch((error: unknown) => {
      console.error(
        `[explain] could not persist the report for !${run.target.iid}:`,
        error instanceof Error ? error.message : error,
      )
    })
  }

  const fail = (run: Run, message: string): void => {
    run.error = message
    setPhase(run, 'failed')
    emit(run, { kind: 'failed', message })
  }

  const execute = async (run: Run): Promise<void> => {
    try {
      const prepared = await deps.prepare(run.target)
      if (run.controller.signal.aborted) return
      if (!prepared.ok) {
        fail(run, prepared.message)
        return
      }
      run.worktreePath = prepared.worktreePath

      setPhase(run, 'running')
      const outcome = await deps.runAgent({
        target: run.target,
        context: run.context,
        worktreePath: prepared.worktreePath,
        onEvent: (event) => {
          const activity = activityFor(event, { worktreePath: prepared.worktreePath })
          if (activity !== null) addActivity(run, activity)
        },
        signal: run.controller.signal,
      })
      if (run.controller.signal.aborted) return

      if (!outcome.ok) {
        fail(run, outcome.message)
        return
      }
      run.report = outcome.report
      setPhase(run, 'report')
      emit(run, { kind: 'report', report: outcome.report })
      persistQuietly(run)
    } catch (error: unknown) {
      // A throw from a dep is a bug in the dep, not a reason to lose the tab.
      if (!run.controller.signal.aborted) {
        fail(run, error instanceof Error ? error.message : 'the explain run failed unexpectedly')
      }
    } finally {
      executing.delete(run.runId)
      pump()
    }
  }

  // Start queued runs until the concurrency bound is reached. Called on every
  // start and on every finish, so the bound holds without a scheduler.
  function pump(): void {
    while (executing.size < MAX_CONCURRENT_RUNS) {
      const runId = queue.shift()
      if (runId === undefined) return
      const run = runs.get(runId)
      // Closed or superseded while queued — skip it and take the next.
      if (run === undefined || run.controller.signal.aborted) continue
      executing.add(runId)
      void execute(run)
    }
  }

  /**
   * Forget a run: abort the agent, tell any open stream, and remove it. The
   * concurrency slot comes back through `execute`'s `finally` when the aborted
   * agent actually stops, not here — holding it until then is what keeps the
   * bound honest rather than merely arithmetically correct.
   */
  const drop = (runId: string): void => {
    const run = runs.get(runId)
    if (run === undefined) return
    run.controller.abort()
    // A watcher learns the run ended rather than hanging on a stream that will
    // never speak again. `interrupted` is the honest word: the run stopped
    // without a verdict.
    if (!isTerminal(run.phase)) {
      run.phase = 'interrupted'
      run.finishedAt = deps.now()
      emit(run, { kind: 'phase', phase: 'interrupted' })
    }
    run.listeners.clear()
    runs.delete(runId)
    if (currentByMr.get(run.target.iid) === runId) currentByMr.delete(run.target.iid)
    const queued = queue.indexOf(runId)
    if (queued !== -1) queue.splice(queued, 1)
  }

  return {
    startRun: (target, context) => {
      const existing = currentByMr.get(target.iid)
      if (existing !== undefined) drop(existing)

      const runId = deps.newRunId()
      const run: Run = {
        runId,
        target,
        context,
        startedAt: deps.now(),
        phase: 'preparing',
        activity: [],
        report: null,
        error: null,
        finishedAt: null,
        worktreePath: null,
        controller: new AbortController(),
        listeners: new Set(),
      }
      runs.set(runId, run)
      currentByMr.set(target.iid, runId)
      // Written pending, before a single event: this is the file that keeps the
      // tab through a reload and turns a dev-server restart into "interrupted"
      // rather than a vanished tab.
      persistQuietly(run)
      queue.push(runId)
      pump()
      return viewOf(run)
    },

    getRun: (runId) => {
      const run = runs.get(runId)
      return run === undefined ? null : viewOf(run)
    },

    getRunForMr: (iid) => {
      const runId = currentByMr.get(iid)
      if (runId === undefined) return null
      const run = runs.get(runId)
      return run === undefined ? null : viewOf(run)
    },

    listRuns: () => [...runs.values()].map(viewOf),

    subscribe: (runId, listener) => {
      const run = runs.get(runId)
      if (run === undefined) return () => {}
      run.listeners.add(listener)
      return () => run.listeners.delete(listener)
    },

    abortRun: (runId) => {
      const run = runs.get(runId)
      if (run === undefined || isTerminal(run.phase)) return false
      drop(runId)
      return true
    },

    closeRun: (iid) => {
      const runId = currentByMr.get(iid)
      if (runId !== undefined) drop(runId)
    },
  }
}
