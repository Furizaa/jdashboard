import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import type { DetailIssue } from '../gateways/jira/types'
import type { RawDiscussion } from '../gateways/gitlab/types'
import { GitlabGateway } from '../gateways/gitlab/port'
import { DetailConfigLive } from '../contexts/detail/config'
import { loadIssue } from '../contexts/detail/application/load-issue'
import { appRuntime } from '../runtime/app-runtime'
import { adfToText } from '../lib/adf-to-text'
import { assertIssueKey } from '../lib/jql'
import { readNote, type NotesStoreDeps } from '../lib/notes-store'
import {
  closeExplainTab,
  explainRuns,
  readExplainTab,
  readExplainTabs,
} from '../lib/explain-registry'
import type { ExplainRunContext } from '../lib/explain-runs'
import {
  discussionsToText,
  explainIssueKeyFor,
  explainTargetFor,
  projectExplainTab,
  type ExplainTab,
} from '../lib/explain-tab'

// Start / read / close for the Explain surface: ordinary ADR-0005 JSON-RPC with
// the tagged `{ ok: false }` wire shape (ADR-0004). **Progress is not here** —
// it is an SSE channel at `routes/api/explain.$runId.stream.ts`, because the
// thing that makes a ten-minute agent run tolerable is watching it work, which
// a request/response envelope cannot express (ADR-0009 §4).
//
// Nothing here writes anything but the report: the agent is read-only by
// construction (`explain-agent.ts`), and the only disk this touches is
// `~/.clashboard/explain/`.
//
// The run registry sits deliberately outside the Effect server boundary (it is
// plain process state — ADR-0009 §4), but the *reads* that feed a run go
// through the existing Effect programs: `GitlabGateway.getMr` for the MR, and
// Detail's own `loadIssue` for the ticket — the same reuse Refine and Ask make.

export type { ExplainTab } from '../lib/explain-tab'

export type StartExplainResult =
  | { readonly ok: true; readonly tab: ExplainTab }
  | { readonly ok: false; readonly error: { readonly message: string } }

export type ListExplainRunsResult = { readonly tabs: readonly ExplainTab[] }

export type GetExplainRunResult = { readonly tab: ExplainTab | null }

export type CloseExplainResult = { readonly ok: true }

function requireIid(label: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} (iid): must be a positive integer`)
  }
  return value
}

function optionalIssueKey(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  return assertIssueKey(value.trim(), 'startExplain')
}

// ---------------------------------------------------------------------------
// Reads that feed a run
// ---------------------------------------------------------------------------

const mrProgram = (iid: number) =>
  Effect.gen(function* () {
    const gitlab = yield* GitlabGateway
    const detail = yield* gitlab.getMr(iid)
    // The thread is context, not a precondition: an MR whose discussions fail to
    // load is still reviewable, so this degrades to none rather than failing.
    const discussions = yield* gitlab
      .getMrDiscussions(iid)
      .pipe(Effect.catchAll(() => Effect.succeed<RawDiscussion[]>([])))
    return { detail, discussions }
  })

/** The MR's head commit now, for the stale-report warning. `null` on any failure. */
const headShaProgram = (iid: number) =>
  Effect.gen(function* () {
    const gitlab = yield* GitlabGateway
    const detail = yield* gitlab.getMr(iid)
    return detail.headSha
  }).pipe(Effect.catchAll(() => Effect.succeed<string | null>(null)))

/** Fetch the ticket for context, degrading to null on any Jira failure. */
const issueProgram = (key: string) =>
  loadIssue(key).pipe(
    Effect.provide(DetailConfigLive),
    Effect.map((ok): DetailIssue | null => ok.issue),
    Effect.catchAll(() => Effect.succeed<DetailIssue | null>(null)),
  )

// Read-only notes deps: Explain only ever calls `readNote`, so the write hooks
// are inert. The "never writes the note" contract is structural, not a promise.
function notesReadDeps(): NotesStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: () => Promise.reject(new Error('explain is read-only')),
    mkdir: () => Promise.reject(new Error('explain is read-only')),
    deleteFile: () => Promise.reject(new Error('explain is read-only')),
    readDir: () => Promise.resolve([]),
  }
}

function commentsToText(issue: DetailIssue | null): string {
  if (issue === null) return ''
  return issue.comments
    .map((c) => {
      const body = adfToText(c.body)
      return body === '' ? '' : `${c.authorName ?? 'Unknown'} (${c.created}):\n${body}`
    })
    .filter((block) => block !== '')
    .join('\n\n')
}

const tabFor = (
  iid: number,
  record: Awaited<ReturnType<typeof readExplainTab>>,
  head: string | null,
) => projectExplainTab({ iid, record, run: explainRuns.getRunForMr(iid), currentHeadSha: head })

// ---------------------------------------------------------------------------
// The four calls
// ---------------------------------------------------------------------------

export const startExplain = createServerFn({ method: 'POST' })
  .inputValidator((data: { iid: number; issueKey?: string }) => ({
    iid: requireIid('startExplain', data?.iid),
    issueKey: optionalIssueKey(data?.issueKey),
  }))
  .handler(async ({ data }): Promise<StartExplainResult> => {
    // The MR is the one hard precondition: without its head SHA there is no
    // commit to check out, and without its target branch no diff range.
    const mr = await appRuntime.runPromise(
      mrProgram(data.iid).pipe(Effect.catchAll(() => Effect.succeed(null))),
    )
    if (mr === null) {
      return { ok: false, error: { message: `could not read merge request !${data.iid}` } }
    }

    const issueKey = explainIssueKeyFor(data.issueKey, mr.detail.title)
    const issue = issueKey === null ? null : await appRuntime.runPromise(issueProgram(issueKey))
    const note = issueKey === null ? '' : await readNote(issueKey, notesReadDeps())

    const context: ExplainRunContext = {
      mrDescription: mr.detail.description,
      mrDiscussions: discussionsToText(mr.discussions),
      ticket: {
        key: issueKey,
        summary: issue?.summary ?? '',
        description: adfToText(issue?.description ?? null),
        comments: commentsToText(issue),
        note,
      },
    }

    const target = explainTargetFor(data.iid, mr.detail, issueKey)
    const run = explainRuns.startRun(target, context)
    return {
      ok: true,
      tab: {
        ...target,
        phase: run.phase,
        runId: run.runId,
        startedAt: new Date(run.startedAt).toISOString(),
        generatedAt: null,
        activity: run.activity,
        report: null,
        error: null,
        currentHeadSha: mr.detail.headSha,
      },
    }
  })

/**
 * The open tab set: **every persisted record**, joined with any live run, plus
 * each MR's current head commit for the stale warning.
 *
 * The set comes from the files and only from the files (ADR-0009 §2). The
 * in-memory registry is an overlay, never a source: a run writes its pending
 * record before its first event, so a live run always has a file, and a finished
 * run that lingers in the registry must not resurrect a tab whose file is gone.
 * The head lookups fan out because the tab count is small by nature — these are
 * reviews one person has open — and each degrades to `null` rather than failing
 * the list.
 */
export const listExplainRuns = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ListExplainRunsResult> => {
    const records = await readExplainTabs()
    const iids = records.map((record) => record.iid)
    const heads = await appRuntime.runPromise(
      Effect.all(
        iids.map((iid) => headShaProgram(iid).pipe(Effect.map((sha) => [iid, sha] as const))),
        { concurrency: 5 },
      ),
    )
    const headByIid = new Map(heads)
    const byIid = new Map(records.map((record) => [record.iid, record]))
    const tabs = iids
      .map((iid) => tabFor(iid, byIid.get(iid) ?? null, headByIid.get(iid) ?? null))
      .filter((tab): tab is ExplainTab => tab !== null)
      .toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))
    return { tabs }
  },
)

export const getExplainRun = createServerFn({ method: 'GET' })
  .inputValidator((data: { iid: number }) => ({ iid: requireIid('getExplainRun', data?.iid) }))
  .handler(async ({ data }): Promise<GetExplainRunResult> => {
    const record = await readExplainTab(data.iid)
    const currentHeadSha = await appRuntime.runPromise(headShaProgram(data.iid))
    return { tab: tabFor(data.iid, record, currentHeadSha) }
  })

export const closeExplain = createServerFn({ method: 'POST' })
  .inputValidator((data: { iid: number }) => ({ iid: requireIid('closeExplain', data?.iid) }))
  .handler(async ({ data }): Promise<CloseExplainResult> => {
    await closeExplainTab(data.iid)
    return { ok: true }
  })
