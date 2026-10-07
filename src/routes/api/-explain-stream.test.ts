import { describe, expect, it } from 'vitest'
import type {
  ExplainRunEvent,
  ExplainRunListener,
  ExplainRunView,
  ExplainRuns,
} from '~/server/lib/explain-runs'
import type { ExplainReport } from '~/server/lib/explain-report'
import { explainStreamResponse, replayFrames, sseFrame } from './explain.$runId.stream'

// Named with the `-` prefix so TanStack's route generator does not look for a
// `Route` export in it, the convention `routes/-app-shell.test.ts` already uses.

// The route-handler unit test ADR-0006 names: given a registry with a known run,
// assert the `Response`'s content type, the event framing, and the 404 for an
// unknown run id. The registry is a hand-rolled fake — no process, no fs.

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

function view(overrides: Partial<ExplainRunView> = {}): ExplainRunView {
  return {
    runId: 'run-1',
    iid: 7,
    phase: 'running',
    target: {
      iid: 7,
      title: 'MR 7',
      webUrl: 'https://gitlab/p/-/merge_requests/7',
      sourceBranch: 'feat/x',
      targetBranch: 'develop',
      headSha: 'sha',
      issueKey: null,
    },
    activity: [],
    report: null,
    error: null,
    startedAt: 0,
    finishedAt: null,
    ...overrides,
  }
}

function fakeRuns(run: ExplainRunView | null) {
  const listeners = new Set<ExplainRunListener>()
  let current = run
  const runs: ExplainRuns = {
    startRun: () => view(),
    getRun: (runId) => (current !== null && runId === current.runId ? current : null),
    getRunForMr: () => current,
    listRuns: () => (current === null ? [] : [current]),
    subscribe: (_runId, listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    abortRun: () => false,
    closeRun: () => {},
  }
  return {
    runs,
    listenerCount: () => listeners.size,
    emit: (event: ExplainRunEvent) => {
      // Copied for the same reason the real registry copies: the handler under
      // test unsubscribes from inside its own callback.
      // oxlint-disable-next-line no-useless-spread -- see comment above
      for (const listener of [...listeners]) listener(event)
    },
    setRun: (next: ExplainRunView) => {
      current = next
    },
  }
}

/** Read everything the stream has produced so far, then let it be. */
async function drain(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- reading a stream is sequential
    const { done, value } = await reader.read()
    if (done) return text
    text += decoder.decode(value)
  }
}

const frames = (text: string): ExplainRunEvent[] =>
  text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as ExplainRunEvent)

describe('sseFrame', () => {
  it('frames one event as one JSON data message', () => {
    expect(sseFrame({ kind: 'phase', phase: 'running' })).toBe(
      'data: {"kind":"phase","phase":"running"}\n\n',
    )
  })

  it('ends every message with the blank line SSE requires', () => {
    expect(sseFrame({ kind: 'failed', message: 'nope' }).endsWith('\n\n')).toBe(true)
  })
})

describe('explainStreamResponse — an unknown run', () => {
  it('is a 404, so the client falls back to the tab’s persisted state', () => {
    const { runs } = fakeRuns(null)
    const response = explainStreamResponse('run-nope', runs)
    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toBe('text/plain')
  })

  it('does not subscribe to a run that does not exist', () => {
    const fake = fakeRuns(null)
    explainStreamResponse('run-nope', fake.runs)
    expect(fake.listenerCount()).toBe(0)
  })
})

describe('explainStreamResponse — a live run', () => {
  it('is a 200 event-stream that is not allowed to be buffered', () => {
    const { runs } = fakeRuns(view())
    const response = explainStreamResponse('run-1', runs)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toContain('no-cache')
    expect(response.headers.get('X-Accel-Buffering')).toBe('no')
  })

  it('replays the activity so far, then the current phase', async () => {
    const fake = fakeRuns(
      view({
        activity: [
          { kind: 'start', text: 'Reading the change', seq: 0, at: 1 },
          { kind: 'read', text: 'a.ts', seq: 1, at: 2 },
        ],
      }),
    )
    const response = explainStreamResponse('run-1', fake.runs)
    // A reload mid-run lands with the whole log and in the right phase — no
    // separate read, nothing missed between the read and the subscribe.
    fake.emit({ kind: 'phase', phase: 'report' })
    fake.emit({ kind: 'report', report: REPORT })

    expect(frames(await drain(response))).toEqual([
      { kind: 'activity', line: { kind: 'start', text: 'Reading the change', seq: 0, at: 1 } },
      { kind: 'activity', line: { kind: 'read', text: 'a.ts', seq: 1, at: 2 } },
      { kind: 'phase', phase: 'running' },
      { kind: 'phase', phase: 'report' },
      { kind: 'report', report: REPORT },
    ])
  })

  it('forwards each activity line as it arrives', async () => {
    const fake = fakeRuns(view())
    const response = explainStreamResponse('run-1', fake.runs)
    fake.emit({ kind: 'activity', line: { kind: 'shell', text: 'git log', seq: 0, at: 1 } })
    fake.emit({ kind: 'phase', phase: 'failed' })
    fake.emit({ kind: 'failed', message: 'nope' })

    expect(frames(await drain(response))).toEqual([
      { kind: 'phase', phase: 'running' },
      { kind: 'activity', line: { kind: 'shell', text: 'git log', seq: 0, at: 1 } },
      { kind: 'phase', phase: 'failed' },
      { kind: 'failed', message: 'nope' },
    ])
  })

  it('closes on the report, not on the phase change that precedes it', async () => {
    const fake = fakeRuns(view())
    const response = explainStreamResponse('run-1', fake.runs)
    fake.emit({ kind: 'phase', phase: 'report' })
    // Closing on the phase would truncate the payload the tab actually needs.
    expect(fake.listenerCount()).toBe(1)
    fake.emit({ kind: 'report', report: REPORT })
    expect(fake.listenerCount()).toBe(0)
    expect(frames(await drain(response)).at(-1)).toEqual({ kind: 'report', report: REPORT })
  })

  it('closes on an interruption, which carries no payload', async () => {
    const fake = fakeRuns(view())
    const response = explainStreamResponse('run-1', fake.runs)
    fake.emit({ kind: 'phase', phase: 'interrupted' })
    expect(fake.listenerCount()).toBe(0)
    expect(frames(await drain(response)).at(-1)).toEqual({ kind: 'phase', phase: 'interrupted' })
  })

  it('unsubscribes when the client goes away mid-run', async () => {
    const fake = fakeRuns(view())
    const response = explainStreamResponse('run-1', fake.runs)
    await response.body?.cancel()
    expect(fake.listenerCount()).toBe(0)
  })
})

describe('explainStreamResponse — a run that is already over', () => {
  it('replays the report and closes without subscribing', async () => {
    const fake = fakeRuns(view({ phase: 'report', report: REPORT }))
    const response = explainStreamResponse('run-1', fake.runs)
    expect(frames(await drain(response))).toEqual([
      { kind: 'phase', phase: 'report' },
      { kind: 'report', report: REPORT },
    ])
    expect(fake.listenerCount()).toBe(0)
  })

  it('replays a failure and closes', async () => {
    const fake = fakeRuns(view({ phase: 'failed', error: 'no such ref' }))
    const response = explainStreamResponse('run-1', fake.runs)
    expect(frames(await drain(response))).toEqual([
      { kind: 'phase', phase: 'failed' },
      { kind: 'failed', message: 'no such ref' },
    ])
  })
})

describe('replayFrames', () => {
  it('has nothing to replay for a run that does not exist', () => {
    const { runs } = fakeRuns(null)
    expect(replayFrames('run-nope', runs)).toEqual([])
  })
})
