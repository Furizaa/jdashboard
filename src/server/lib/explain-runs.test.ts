import { describe, expect, it } from 'vitest'
import type { ClaudeStreamEvent } from './claude-cli'
import type { ExplainReport } from './explain-report'
import type { ExplainRecord } from './explain-store'
import {
  MAX_CONCURRENT_RUNS,
  createExplainRuns,
  type ExplainAgentOutcome,
  type ExplainRunContext,
  type ExplainRunEvent,
  type ExplainRunsDeps,
  type ExplainTarget,
} from './explain-runs'

// The prompt context the caller gathers before a run starts; the registry only
// forwards it, so one value serves every test.
const CONTEXT: ExplainRunContext = {
  mrDescription: 'Callers round now.',
  mrDiscussions: '',
  ticket: { key: 'HDR-1', summary: 'Rounding', description: '', comments: '', note: '' },
}

const REPORT: ExplainReport = {
  version: 2,
  overview: [{ type: 'verdict', verdict: 'sound', headline: 'Fits' }],
  moves: [
    {
      id: 'the-one-move',
      title: 'One move',
      summary: 'Enough of a move to satisfy the contract.',
      systems: ['pricing'],
      paths: ['src/pricing/quote.ts'],
      blocks: [{ type: 'narrative', body: 'It moved.' }],
    },
  ],
}

function target(iid: number): ExplainTarget {
  return {
    iid,
    title: `MR ${iid}`,
    webUrl: `https://gitlab/p/-/merge_requests/${iid}`,
    sourceBranch: 'feat/x',
    targetBranch: 'develop',
    headSha: `sha${iid}`,
    issueKey: 'HDR-1',
  }
}

/** A deferred promise, so a test drives each phase boundary by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type AgentCall = {
  readonly target: ExplainTarget
  readonly context: ExplainRunContext
  readonly worktreePath: string
  readonly signal: AbortSignal
  readonly onEvent: (event: ClaudeStreamEvent) => void
  readonly settle: (outcome: ExplainAgentOutcome) => void
}

/**
 * The harness: a fake prepare, a fake streaming agent whose every call is
 * settled by the test, a fake clock, and a recording store. No process is
 * spawned and no file is written.
 */
function harness(options: { readonly prepareFails?: string } = {}) {
  const prepared: number[] = []
  const persisted: ExplainRecord[] = []
  const agentCalls: AgentCall[] = []
  let clock = 1_000
  let ids = 0

  const deps: ExplainRunsDeps = {
    prepare: (t) => {
      prepared.push(t.iid)
      return Promise.resolve(
        options.prepareFails === undefined
          ? { ok: true, worktreePath: `/wt/mr-${t.iid}` }
          : { ok: false, message: options.prepareFails },
      )
    },
    runAgent: ({ target: t, context, worktreePath, onEvent, signal }) => {
      const gate = deferred<ExplainAgentOutcome>()
      agentCalls.push({ target: t, context, worktreePath, onEvent, signal, settle: gate.resolve })
      return gate.promise
    },
    persist: (record) => {
      persisted.push(record)
      return Promise.resolve()
    },
    now: () => {
      clock += 1
      return clock
    },
    newRunId: () => {
      ids += 1
      return `run-${ids}`
    },
  }

  return { runs: createExplainRuns(deps), prepared, persisted, agentCalls }
}

/** Collects everything a watcher would see on the SSE channel. */
function watch(runs: ReturnType<typeof harness>['runs'], runId: string) {
  const events: ExplainRunEvent[] = []
  const unsubscribe = runs.subscribe(runId, (event) => events.push(event))
  return { events, unsubscribe, kinds: () => events.map((e) => e.kind) }
}

const tick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

describe('startRun — the phase sequence', () => {
  it('starts in preparing and reports the run straight back', () => {
    const { runs } = harness()
    const view = runs.startRun(target(1), CONTEXT)
    expect(view).toMatchObject({ runId: 'run-1', iid: 1, phase: 'preparing', report: null })
    expect(runs.getRun('run-1')?.phase).toBe('preparing')
  })

  it('walks preparing → running → report', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    const seen = watch(runs, 'run-1')
    await tick()

    expect(runs.getRun('run-1')?.phase).toBe('running')
    agentCalls[0]?.settle({ ok: true, report: REPORT })
    await tick()

    expect(runs.getRun('run-1')?.phase).toBe('report')
    expect(runs.getRun('run-1')?.report).toEqual(REPORT)
    // The terminal message carries the report, after the phase change.
    expect(seen.kinds()).toEqual(['phase', 'phase', 'report'])
    expect(seen.events.at(-1)).toEqual({ kind: 'report', report: REPORT })
  })

  it('runs the agent inside the prepared worktree', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(42), CONTEXT)
    await tick()
    expect(agentCalls[0]?.worktreePath).toBe('/wt/mr-42')
  })

  it('fails without ever running the agent when the checkout fails', async () => {
    const { runs, agentCalls } = harness({ prepareFails: 'no such ref' })
    runs.startRun(target(1), CONTEXT)
    const seen = watch(runs, 'run-1')
    await tick()

    expect(runs.getRun('run-1')).toMatchObject({ phase: 'failed', error: 'no such ref' })
    expect(agentCalls).toHaveLength(0)
    expect(seen.events).toEqual([
      { kind: 'phase', phase: 'failed' },
      { kind: 'failed', message: 'no such ref' },
    ])
  })

  it('fails with the agent’s message when the agent loses', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    agentCalls[0]?.settle({ ok: false, message: 'the explain report did not match the contract' })
    await tick()
    expect(runs.getRun('run-1')).toMatchObject({
      phase: 'failed',
      error: 'the explain report did not match the contract',
      report: null,
    })
  })

  it('fails rather than hanging when a dependency throws', async () => {
    const { runs } = harness()
    const broken = createExplainRuns({
      prepare: () => Promise.reject(new Error('fs exploded')),
      runAgent: () => Promise.resolve({ ok: true, report: REPORT }),
      persist: () => Promise.resolve(),
      now: () => 0,
      newRunId: () => 'run-x',
    })
    broken.startRun(target(1), CONTEXT)
    await tick()
    expect(broken.getRun('run-x')).toMatchObject({ phase: 'failed', error: 'fs exploded' })
    // The harness instance is untouched — no shared state between registries.
    expect(runs.listRuns()).toEqual([])
  })
})

describe('activity translation', () => {
  it('turns stream events into activity lines, numbered and timestamped', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    const call = agentCalls[0]
    if (call === undefined) throw new Error('no agent call')

    call.onEvent({ type: 'system', subtype: 'init' })
    call.onEvent({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/wt/mr-1/a.ts' } }],
      },
    })

    expect(runs.getRun('run-1')?.activity).toEqual([
      { kind: 'start', text: 'Reading the change', seq: 0, at: expect.any(Number) },
      // Path made relative to the worktree the registry prepared.
      { kind: 'read', text: 'a.ts', seq: 1, at: expect.any(Number) },
    ])
  })

  it('drops events with nothing to show rather than logging an empty line', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    agentCalls[0]?.onEvent({ type: 'user', message: { content: [{ type: 'tool_result' }] } })
    expect(runs.getRun('run-1')?.activity).toEqual([])
  })

  it('pushes each line to every subscriber', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    const a = watch(runs, 'run-1')
    const b = watch(runs, 'run-1')
    await tick()
    agentCalls[0]?.onEvent({ type: 'system', subtype: 'init' })

    for (const seen of [a, b]) {
      expect(seen.events).toContainEqual({
        kind: 'activity',
        line: { kind: 'start', text: 'Reading the change', seq: 0, at: expect.any(Number) },
      })
    }
  })

  it('stops delivering to a subscriber that unsubscribed', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    const seen = watch(runs, 'run-1')
    await tick()
    seen.unsubscribe()
    agentCalls[0]?.onEvent({ type: 'system', subtype: 'init' })
    expect(seen.events.filter((e) => e.kind === 'activity')).toEqual([])
  })

  it('keeps going when one subscriber throws', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    runs.subscribe('run-1', () => {
      throw new Error('the browser went away')
    })
    const healthy = watch(runs, 'run-1')
    await tick()
    agentCalls[0]?.settle({ ok: true, report: REPORT })
    await tick()
    expect(healthy.kinds()).toContain('report')
  })

  it('hands a no-op unsubscribe back for a run that does not exist', () => {
    const { runs } = harness()
    expect(() => runs.subscribe('nope', () => {})()).not.toThrow()
  })
})

describe('the two-run bound', () => {
  it('runs two at once and queues the third', async () => {
    expect(MAX_CONCURRENT_RUNS).toBe(2)
    const { runs, prepared, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    runs.startRun(target(2), CONTEXT)
    runs.startRun(target(3), CONTEXT)
    await tick()

    // The third has not even been checked out: the queue is upstream of prepare.
    expect(prepared).toEqual([1, 2])
    expect(runs.getRunForMr(3)?.phase).toBe('preparing')

    agentCalls[0]?.settle({ ok: true, report: REPORT })
    await tick()
    expect(prepared).toEqual([1, 2, 3])
  })

  it('lets a queued run through when a slot frees by failure, not only by success', async () => {
    const { runs, prepared, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    runs.startRun(target(2), CONTEXT)
    runs.startRun(target(3), CONTEXT)
    await tick()
    agentCalls[1]?.settle({ ok: false, message: 'nope' })
    await tick()
    expect(prepared).toContain(3)
  })

  it('skips a queued run that was closed before its slot came up', async () => {
    const { runs, prepared, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    runs.startRun(target(2), CONTEXT)
    runs.startRun(target(3), CONTEXT)
    runs.startRun(target(4), CONTEXT)
    await tick()

    runs.closeRun(3)
    agentCalls[0]?.settle({ ok: true, report: REPORT })
    await tick()
    expect(prepared).toEqual([1, 2, 4])
  })
})

describe('abort and close', () => {
  it('aborts a run in flight and signals the agent', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    const seen = watch(runs, 'run-1')
    await tick()

    expect(runs.abortRun('run-1')).toBe(true)
    expect(agentCalls[0]?.signal.aborted).toBe(true)
    // A watcher learns the run ended rather than hanging on a dead stream.
    expect(seen.events.at(-1)).toEqual({ kind: 'phase', phase: 'interrupted' })
    expect(runs.getRun('run-1')).toBeNull()
  })

  it('does not fail a run that was aborted, even if the agent answers later', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    runs.abortRun('run-1')
    agentCalls[0]?.settle({ ok: false, message: 'killed' })
    await tick()
    // Forgotten, not failed: the user asked for it to stop.
    expect(runs.getRun('run-1')).toBeNull()
    expect(runs.listRuns()).toEqual([])
  })

  it('returns the slot an aborted run held once its agent actually stops', async () => {
    const { runs, prepared, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    runs.startRun(target(2), CONTEXT)
    runs.startRun(target(3), CONTEXT)
    await tick()
    runs.abortRun('run-1')
    // Held until the agent stops — the bound is about real processes, not arithmetic.
    expect(prepared).toEqual([1, 2])
    agentCalls[0]?.settle({ ok: false, message: 'killed' })
    await tick()
    expect(prepared).toEqual([1, 2, 3])
  })

  it('refuses to abort a run that already finished', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    agentCalls[0]?.settle({ ok: true, report: REPORT })
    await tick()
    expect(runs.abortRun('run-1')).toBe(false)
    expect(runs.getRun('run-1')?.phase).toBe('report')
  })

  it('refuses to abort a run id it has never heard of', () => {
    const { runs } = harness()
    expect(runs.abortRun('run-nope')).toBe(false)
  })

  it('closes an MR by forgetting its run', async () => {
    const { runs } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    runs.closeRun(1)
    expect(runs.getRunForMr(1)).toBeNull()
    expect(runs.listRuns()).toEqual([])
  })

  it('closing an MR with no run is a no-op', () => {
    const { runs } = harness()
    expect(() => runs.closeRun(999)).not.toThrow()
  })
})

describe('re-run', () => {
  it('supersedes the run in flight for the same MR', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    const first = watch(runs, 'run-1')
    await tick()

    const second = runs.startRun(target(1), CONTEXT)
    expect(second.runId).toBe('run-2')
    expect(agentCalls[0]?.signal.aborted).toBe(true)
    expect(first.events.at(-1)).toEqual({ kind: 'phase', phase: 'interrupted' })
    // One live run per MR, so the tab never has two streams to choose between.
    expect(runs.getRunForMr(1)?.runId).toBe('run-2')
    expect(runs.listRuns()).toHaveLength(1)
  })

  it('replaces a finished report with a fresh run', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    agentCalls[0]?.settle({ ok: true, report: REPORT })
    await tick()

    runs.startRun({ ...target(1), headSha: 'sha-new' }, CONTEXT)
    await tick()
    expect(runs.getRunForMr(1)).toMatchObject({
      runId: 'run-2',
      phase: 'running',
      report: null,
      target: { headSha: 'sha-new' },
    })
  })
})

describe('persistence', () => {
  it('writes the tab pending at start, before a single event', () => {
    const { runs, persisted } = harness()
    runs.startRun(target(1), CONTEXT)
    // This file is what keeps the tab through a reload, and what turns a
    // dev-server restart into "interrupted" rather than a vanished tab.
    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toMatchObject({ iid: 1, report: null, generatedAt: null })
    expect(persisted[0]?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('rewrites the tab with the report when it lands', async () => {
    const { runs, persisted, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    agentCalls[0]?.settle({ ok: true, report: REPORT })
    await tick()
    expect(persisted).toHaveLength(2)
    expect(persisted[1]).toMatchObject({ iid: 1, report: REPORT })
    expect(persisted[1]?.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('does not persist a report for a failed run', async () => {
    const { runs, persisted, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    agentCalls[0]?.settle({ ok: false, message: 'nope' })
    await tick()
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.report).toBeNull()
  })

  it('keeps the report when persistence fails — ten minutes of work is not lost to disk', async () => {
    const gate = deferred<ExplainAgentOutcome>()
    const runs = createExplainRuns({
      prepare: () => Promise.resolve({ ok: true, worktreePath: '/wt' }),
      runAgent: () => gate.promise,
      persist: () => Promise.reject(new Error('disk full')),
      now: () => 1,
      newRunId: () => 'run-1',
    })
    runs.startRun(target(1), CONTEXT)
    await tick()
    gate.resolve({ ok: true, report: REPORT })
    await tick()
    expect(runs.getRun('run-1')).toMatchObject({ phase: 'report', report: REPORT })
  })
})

describe('reading runs', () => {
  it('lists every live run', async () => {
    const { runs } = harness()
    runs.startRun(target(1), CONTEXT)
    runs.startRun(target(2), CONTEXT)
    await tick()
    expect(
      runs
        .listRuns()
        .map((r) => r.iid)
        .toSorted(),
    ).toEqual([1, 2])
  })

  it('has no run for an MR that was never started', () => {
    const { runs } = harness()
    expect(runs.getRunForMr(1)).toBeNull()
    expect(runs.getRun('run-1')).toBeNull()
  })

  it('carries the target through, so a tab can label itself with no network', () => {
    const { runs } = harness()
    expect(runs.startRun(target(7), CONTEXT).target).toMatchObject({
      iid: 7,
      title: 'MR 7',
      targetBranch: 'develop',
      headSha: 'sha7',
      issueKey: 'HDR-1',
    })
  })

  it('forwards the prompt context to the agent untouched', async () => {
    const { runs, agentCalls } = harness()
    runs.startRun(target(1), CONTEXT)
    await tick()
    expect(agentCalls[0]?.context).toBe(CONTEXT)
  })
})
