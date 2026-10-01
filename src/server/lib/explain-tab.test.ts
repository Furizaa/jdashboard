import { describe, expect, it } from 'vitest'
import type { RawDiscussion } from '../gateways/gitlab/types'
import type { ExplainReport } from './explain-report'
import type { ExplainRunView } from './explain-runs'
import type { ExplainRecord } from './explain-store'
import { discussionsToText, explainIssueKeyFor, projectExplainTab } from './explain-tab'

const REPORT: ExplainReport = {
  version: 1,
  blocks: [{ type: 'verdict', verdict: 'sound', headline: 'Fits' }],
}

const TARGET = {
  iid: 7,
  title: 'HDR-7: move rounding',
  webUrl: 'https://gitlab/p/-/merge_requests/7',
  sourceBranch: 'feat/x',
  targetBranch: 'develop',
  headSha: 'sha-report',
  issueKey: 'HDR-7',
}

function record(overrides: Partial<ExplainRecord> = {}): ExplainRecord {
  return {
    ...TARGET,
    version: 1,
    startedAt: '2026-10-01T09:00:00.000Z',
    generatedAt: null,
    report: null,
    ...overrides,
  }
}

function run(overrides: Partial<ExplainRunView> = {}): ExplainRunView {
  return {
    runId: 'run-1',
    iid: 7,
    phase: 'running',
    target: TARGET,
    activity: [],
    report: null,
    error: null,
    startedAt: Date.parse('2026-10-01T09:05:00.000Z'),
    finishedAt: null,
    ...overrides,
  }
}

const project = (input: {
  record?: ExplainRecord | null
  run?: ExplainRunView | null
  currentHeadSha?: string | null
}) =>
  projectExplainTab({
    iid: 7,
    record: input.record ?? null,
    run: input.run ?? null,
    currentHeadSha: input.currentHeadSha ?? null,
  })

describe('projectExplainTab', () => {
  it('has no tab when neither the file nor a run knows about the MR', () => {
    expect(project({})).toBeNull()
  })

  it('reads a finished record as a report tab', () => {
    const tab = project({
      record: record({ report: REPORT, generatedAt: '2026-10-01T09:11:00.000Z' }),
    })
    expect(tab).toMatchObject({
      phase: 'report',
      runId: null,
      report: REPORT,
      generatedAt: '2026-10-01T09:11:00.000Z',
      startedAt: '2026-10-01T09:00:00.000Z',
    })
  })

  it('reads a pending record with no live run as interrupted', () => {
    // The dev-server-restart case. This is the whole reason the record is
    // written before the report exists: the tab survives, and it says so.
    expect(project({ record: record() })).toMatchObject({
      phase: 'interrupted',
      runId: null,
      report: null,
    })
  })

  it('lets the live run win over the file — it is the present tense', () => {
    const tab = project({
      record: record({ report: REPORT, generatedAt: '2026-10-01T09:11:00.000Z' }),
      run: run({ phase: 'running' }),
    })
    expect(tab).toMatchObject({
      phase: 'running',
      runId: 'run-1',
      // The re-run has no report yet, and showing the old one under a live run
      // would be describing a tree nobody is looking at.
      report: null,
      startedAt: '2026-10-01T09:05:00.000Z',
    })
  })

  it('keeps generatedAt from the file, the one thing only the file knows', () => {
    const tab = project({
      record: record({ report: REPORT, generatedAt: '2026-10-01T09:11:00.000Z' }),
      run: run({ phase: 'report', report: REPORT }),
    })
    expect(tab?.generatedAt).toBe('2026-10-01T09:11:00.000Z')
  })

  it('carries a failed run’s message', () => {
    const tab = project({ record: record(), run: run({ phase: 'failed', error: 'no such ref' }) })
    expect(tab).toMatchObject({ phase: 'failed', error: 'no such ref' })
  })

  it('carries the activity log so a reload rejoins mid-run', () => {
    const activity = [{ kind: 'read' as const, text: 'a.ts', seq: 0, at: 1 }]
    expect(project({ record: record(), run: run({ activity }) })?.activity).toEqual(activity)
  })

  it('builds a tab from a live run alone, before the first write lands', () => {
    expect(project({ run: run({ phase: 'preparing' }) })).toMatchObject({
      phase: 'preparing',
      title: 'HDR-7: move rounding',
      generatedAt: null,
    })
  })

  it('reports the MR’s current head beside the one the report describes', () => {
    const tab = project({ record: record({ report: REPORT }), currentHeadSha: 'sha-new' })
    expect(tab?.headSha).toBe('sha-report')
    expect(tab?.currentHeadSha).toBe('sha-new')
  })

  it('reports an unreachable GitLab as an unknown head rather than guessing', () => {
    expect(project({ record: record() })?.currentHeadSha).toBeNull()
  })
})

describe('discussionsToText', () => {
  const thread = (notes: RawDiscussion['notes']): RawDiscussion => ({ id: 'd', notes })
  const note = (overrides: Partial<RawDiscussion['notes'][number]>) => ({
    authorUsername: 'alice',
    body: 'why here?',
    resolvable: true,
    resolved: false,
    system: false,
    ...overrides,
  })

  it('renders one block per thread, author-prefixed', () => {
    expect(
      discussionsToText([
        thread([note({}), note({ authorUsername: 'bob', body: 'because of X' })]),
        thread([note({ authorUsername: 'carol', body: 'separate point' })]),
      ]),
    ).toBe('alice: why here?\nbob: because of X\n\ncarol: separate point')
  })

  it('filters out system notes — "added 3 commits" is noise to the agent', () => {
    expect(discussionsToText([thread([note({ system: true, body: 'added 3 commits' })])])).toBe('')
  })

  it('keeps a thread whose user notes sit beside system ones', () => {
    expect(
      discussionsToText([thread([note({ system: true, body: 'changed title' }), note({})])]),
    ).toBe('alice: why here?')
  })

  it('marks a resolved thread rather than dropping it', () => {
    // That a concern was raised and settled is review context.
    expect(discussionsToText([thread([note({ resolved: true })])])).toBe(
      '[resolved] alice: why here?',
    )
  })

  it('drops an empty-bodied note', () => {
    expect(discussionsToText([thread([note({ body: '   ' })])])).toBe('')
  })

  it('renders no discussions as the empty string', () => {
    expect(discussionsToText([])).toBe('')
  })
})

describe('explainIssueKeyFor', () => {
  it('prefers the key the caller handed over', () => {
    expect(explainIssueKeyFor('HDR-1', 'HDR-999: something')).toBe('HDR-1')
  })

  it('falls back to the key in the MR title — the review-card case', () => {
    // An MR someone else wrote: the board may know nothing else about it.
    expect(explainIssueKeyFor(null, 'HDR-4211: move rounding')).toBe('HDR-4211')
  })

  it('finds a key embedded mid-title', () => {
    expect(explainIssueKeyFor(null, 'Draft: fix the thing (HDR-12)')).toBe('HDR-12')
  })

  it('has no key when the title carries none', () => {
    expect(explainIssueKeyFor(null, 'chore: bump deps')).toBeNull()
    expect(explainIssueKeyFor('', 'chore: bump deps')).toBeNull()
  })

  it('does not mistake a longer key for a shorter one', () => {
    expect(explainIssueKeyFor(null, 'HDR-19: x')).toBe('HDR-19')
  })
})
