// The Explain run registry: the process-scoped `runId → run` map, its
// subscribers, and the concurrency queue. What one run *is* — its phases, its
// deps, and the steps that advance it — is `explain-run.ts`.
//
// Why a registry at all, rather than one long `createServerFn` call: the CLI
// caps at three minutes by default and an architect-grade review overruns it; a
// ten-minute HTTP request survives no reload; and the run would be a black box
// for its whole duration, which is the worst property a ten-minute wait can
// have. So start / read / close are ordinary JSON-RPC and **progress is an SSE
// channel** fed from here.

import {
  emit,
  execute,
  isTerminal,
  persistQuietly,
  viewOf,
  type ExplainRunContext,
  type ExplainRunListener,
  type ExplainRunView,
  type ExplainRunsDeps,
  type Run,
} from './explain-run'
import type { ExplainTarget } from './explain-store'

export type {
  ExplainActivityLine,
  ExplainAgentOutcome,
  ExplainPhase,
  ExplainRunContext,
  ExplainRunEvent,
  ExplainRunListener,
  ExplainRunView,
  ExplainRunsDeps,
  ExplainTarget,
} from './explain-run'

/**
 * Two at a time. The run is heavy — an Opus session reading a repository — and
 * the machine is also the user's. Further starts queue rather than being
 * refused: queueing is invisible except as a slower start, whereas a refusal is
 * a dead end the user has to understand (ADR-0009 §4).
 */
export const MAX_CONCURRENT_RUNS = 2

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

/**
 * The registry's own state. Named, rather than four closed-over locals, because
 * the queue rules below are about the relationship between them: a run is in
 * `runs` from start to close, in `queue` until it is picked up, in `executing`
 * while it holds one of the `MAX_CONCURRENT_RUNS` slots, and in `currentByMr`
 * only while it is the newest run for its merge request.
 */
type Registry = {
  readonly runs: Map<string, Run>
  readonly currentByMr: Map<number, string>
  readonly queue: string[]
  /**
   * The runs holding a concurrency slot. A set rather than a counter so a run
   * that is aborted mid-flight cannot return its slot twice: the slot is given
   * back exactly once, when `execute`'s promise settles.
   */
  readonly executing: Set<string>
}

// Start queued runs until the concurrency bound is reached. Called on every
// start and on every finish, so the bound holds without a scheduler.
function pump(reg: Registry, deps: ExplainRunsDeps): void {
  while (reg.executing.size < MAX_CONCURRENT_RUNS) {
    const runId = reg.queue.shift()
    if (runId === undefined) return
    const run = reg.runs.get(runId)
    // Closed or superseded while queued — skip it and take the next.
    if (run === undefined || run.controller.signal.aborted) continue
    reg.executing.add(runId)
    void execute(deps, run).finally(() => {
      reg.executing.delete(runId)
      pump(reg, deps)
    })
  }
}

/**
 * Forget a run: abort the agent, tell any open stream, and remove it. The
 * concurrency slot comes back when the aborted agent actually stops, not here —
 * holding it until then is what keeps the bound honest rather than merely
 * arithmetically correct.
 */
function drop(reg: Registry, deps: ExplainRunsDeps, runId: string): void {
  const run = reg.runs.get(runId)
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
  reg.runs.delete(runId)
  if (reg.currentByMr.get(run.target.iid) === runId) reg.currentByMr.delete(run.target.iid)
  const queued = reg.queue.indexOf(runId)
  if (queued !== -1) reg.queue.splice(queued, 1)
}

function newRun(deps: ExplainRunsDeps, target: ExplainTarget, context: ExplainRunContext): Run {
  return {
    runId: deps.newRunId(),
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
}

const viewFor = (reg: Registry, runId: string | undefined): ExplainRunView | null => {
  if (runId === undefined) return null
  const run = reg.runs.get(runId)
  return run === undefined ? null : viewOf(run)
}

export function createExplainRuns(deps: ExplainRunsDeps): ExplainRuns {
  const reg: Registry = {
    runs: new Map(),
    currentByMr: new Map(),
    queue: [],
    executing: new Set(),
  }

  return {
    startRun: (target, context) => {
      const existing = reg.currentByMr.get(target.iid)
      if (existing !== undefined) drop(reg, deps, existing)

      const run = newRun(deps, target, context)
      reg.runs.set(run.runId, run)
      reg.currentByMr.set(target.iid, run.runId)
      // Written pending, before a single event: this is the file that keeps the
      // tab through a reload and turns a dev-server restart into "interrupted"
      // rather than a vanished tab.
      persistQuietly(deps, run)
      reg.queue.push(run.runId)
      pump(reg, deps)
      return viewOf(run)
    },

    getRun: (runId) => viewFor(reg, runId),

    getRunForMr: (iid) => viewFor(reg, reg.currentByMr.get(iid)),

    listRuns: () => [...reg.runs.values()].map(viewOf),

    subscribe: (runId, listener) => {
      const run = reg.runs.get(runId)
      if (run === undefined) return () => {}
      run.listeners.add(listener)
      return () => run.listeners.delete(listener)
    },

    abortRun: (runId) => {
      const run = reg.runs.get(runId)
      if (run === undefined || isTerminal(run.phase)) return false
      drop(reg, deps, runId)
      return true
    },

    closeRun: (iid) => {
      const runId = reg.currentByMr.get(iid)
      if (runId !== undefined) drop(reg, deps, runId)
    },
  }
}
