// The one live Explain run registry, with its real dependencies wired in.
//
// It is a module-scoped singleton because the two things that touch it are two
// different HTTP shapes of the same process: `server-functions/explain.ts`
// (JSON-RPC: start, read, close) and `routes/api/explain.$runId.stream.ts`
// (SSE: watch). The api-route layer may not import the server-function layer
// (ADR-0006), so the shared state lives here, below both.
//
// Being in-memory is the acknowledged limit (ADR-0009 consequences): a
// dev-server restart loses a run **in flight** — the tab reads "interrupted —
// re-run" off its pending file — and never loses a **finished** report, which is
// on disk. Upgrade path: swap this module's store for a durable one.

import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { removeWorktreeInBackground, utf8Spawn } from './git-process'
import { loadSkillBody, streamClaude, type ClaudeStreamEvent } from './claude-cli'
import {
  EXPLAIN_SKILL_PATH,
  EXPLAIN_TIMEOUT_MS,
  buildExplainPrompt,
  explainClaudeArgs,
  finalReplyFrom,
  streamErrorFrom,
} from './explain-agent'
import { parseExplainReport } from './explain-report'
import { createExplainRuns, type ExplainAgentOutcome, type ExplainRuns } from './explain-runs'
import {
  deleteExplainRecord,
  listExplainRecords,
  readExplainRecord,
  writeExplainRecord,
  type ExplainRecord,
  type ExplainStoreDeps,
} from './explain-store'
import { runDiscardExplainWorktree, runPrepareExplainWorktree } from './explain-worktree'

export function explainStoreDeps(): ExplainStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (path) => readFile(path, 'utf8'),
    writeFile: (path, data) => writeFile(path, data, 'utf8'),
    mkdir: async (path) => {
      await mkdir(path, { recursive: true })
    },
    deleteFile: (path) => rm(path),
    readDir: (path) => readdir(path),
  }
}

/**
 * Build the prompt, stream the agent, parse its reply. The three failure shapes
 * — the process never ran, the CLI reported an error, the reply did not match
 * the contract — all come back as one tagged message, so the registry has a
 * single terminal-failure path.
 */
async function runExplainAgent(input: {
  readonly prompt: string
  readonly worktreePath: string
  readonly onEvent: (event: ClaudeStreamEvent) => void
  readonly signal: AbortSignal
}): Promise<ExplainAgentOutcome> {
  let skillBody: string
  try {
    skillBody = await loadSkillBody(EXPLAIN_SKILL_PATH)
  } catch {
    return { ok: false, message: 'the explain skill is missing from the app install' }
  }

  // Kept so the terminal event can be read after the stream closes; the events
  // themselves are forwarded as they arrive, so nothing waits on this.
  const events: ClaudeStreamEvent[] = []
  const result = await streamClaude(explainClaudeArgs(skillBody), input.prompt, {
    cwd: input.worktreePath,
    timeoutMs: EXPLAIN_TIMEOUT_MS,
    signal: input.signal,
    onEvent: (event) => {
      events.push(event)
      input.onEvent(event)
    },
  })

  if (result.aborted) return { ok: false, message: 'the explain run was cancelled' }
  if (result.error !== undefined) {
    return { ok: false, message: `could not run the explain agent: ${result.error.message}` }
  }

  const reported = streamErrorFrom(events)
  if (reported !== null) return { ok: false, message: `explain agent: ${reported}` }

  if (result.status !== 0) {
    const detail = result.stderr.trim() || `exit code ${result.status ?? 'unknown'}`
    return { ok: false, message: `the explain agent exited with an error: ${detail}` }
  }

  const reply = finalReplyFrom(events)
  if (reply === null) return { ok: false, message: 'the explain agent returned no report' }

  const parsed = parseExplainReport(reply)
  // The raw reply is kept out of the user-facing message deliberately — it can
  // be thousands of lines — and logged instead, which is where a prompt problem
  // is actually diagnosed.
  if (!parsed.ok) {
    console.error('[explain] report did not validate. Raw reply:\n', parsed.error.raw)
    return { ok: false, message: parsed.error.message }
  }
  return { ok: true, report: parsed.report }
}

function createLiveExplainRuns(): ExplainRuns {
  return createExplainRuns({
    prepare: (target) => {
      const result = runPrepareExplainWorktree(
        { iid: target.iid, headSha: target.headSha, targetBranch: target.targetBranch },
        { homeDir: homedir(), exists: existsSync, spawn: utf8Spawn },
      )
      return Promise.resolve(
        result.ok
          ? { ok: true as const, worktreePath: result.worktreePath }
          : { ok: false as const, message: `could not check out the MR: ${result.error.message}` },
      )
    },
    runAgent: ({ target, context, worktreePath, onEvent, signal }) =>
      runExplainAgent({
        prompt: buildExplainPrompt({
          mr: {
            iid: target.iid,
            title: target.title,
            description: context.mrDescription,
            webUrl: target.webUrl,
            sourceBranch: target.sourceBranch,
            targetBranch: target.targetBranch,
            headSha: target.headSha,
            discussions: context.mrDiscussions,
          },
          ticket: context.ticket,
          worktreePath,
        }),
        worktreePath,
        onEvent,
        signal,
      }),
    persist: (record) => writeExplainRecord(record, explainStoreDeps()),
    now: () => Date.now(),
    newRunId: () => randomUUID(),
  })
}

// Pinned on `globalThis`, not just on the module. In dev, Vite can re-evaluate
// a server module, and two registries would be worse than none: the RPC call
// would start a run in one while the SSE route looked for it in the other, which
// reads as "the stream 404s for no reason" rather than as the honest "the run
// was lost". One registry per process, whatever the module graph does.
//
// **The cost, and it is sharp: HMR cannot reach anything the registry captured.**
// `createLiveExplainRuns()` runs exactly once per process, so its closures hold
// the module instances that existed at that moment — `parseExplainReport`,
// `buildExplainPrompt`, `explainClaudeArgs`, the worktree runner. Editing any of
// them re-evaluates this module, the `??=` finds the registry already there, and
// the old closures keep running. A contract change therefore shows up as the
// *previous* contract rejecting the *current* agent reply ("expected 1; blocks:
// expected array, received undefined" after the report went v2), and re-running
// never helps because every run goes through the same captured parser.
//
// So: **restart the dev server after touching an `explain-*` server module.** The
// one thing that does pick up an edit live is the skill body, which is read from
// disk per run — which is also why a stale server and a current agent can
// disagree at all.
const REGISTRY_KEY = '__clashboardExplainRuns'

type RegistryHost = typeof globalThis & { [REGISTRY_KEY]?: ExplainRuns }

function liveExplainRuns(): ExplainRuns {
  const host = globalThis as RegistryHost
  host[REGISTRY_KEY] ??= createLiveExplainRuns()
  return host[REGISTRY_KEY]
}

export const explainRuns: ExplainRuns = liveExplainRuns()

/** Every persisted tab — the open set the tab strip is derived from. */
export function readExplainTabs(): Promise<ExplainRecord[]> {
  return listExplainRecords(explainStoreDeps())
}

export function readExplainTab(iid: number): Promise<ExplainRecord | null> {
  return readExplainRecord(iid, explainStoreDeps())
}

/**
 * Close one tab: abort any run in flight, delete the report, and remove the
 * worktree. All three, because a half-closed tab is worse than either state —
 * and the worktree removal is what keeps reviews from silently accumulating
 * checkouts on disk.
 */
export async function closeExplainTab(iid: number): Promise<void> {
  explainRuns.closeRun(iid)
  await deleteExplainRecord(iid, explainStoreDeps())
  runDiscardExplainWorktree(iid, {
    homeDir: homedir(),
    exists: existsSync,
    removeWorktreeInBackground,
  })
}
