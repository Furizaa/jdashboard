// Shared plumbing for clashboard's headless-Claude features (note Refine, Ask,
// bulk-refine transcript routing, and Explain). All shell out to the local
// `claude` CLI in print mode on the user's own always-authenticated machine — no
// API key — and all but Explain parse the same `--output-format json` envelope.
// This module owns the concerns they share: running the CLI (one-shot or
// streaming), and pulling one JSON object out of the agent's reply.
//
// The spawn is async (`spawn`, not `spawnSync`): a refine can take minutes, and
// blocking the single Node process for that long would freeze every other
// request — fatal once bulk-refine runs several at once. Async lets the event
// loop serve other work and lets the caller run a bounded pool of refines.

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

// The result of one `claude -p` run. Same shape the old `spawnSync` produced, so
// the pure parsers (`parseRefineResult`, `parseRouteResult`) are unchanged.
export type ClaudeRunResult = {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
  readonly error?: Error
}

// Per-call overrides on a run. Both are optional and both default to what Refine
// and Ask already got, so their call sites are unchanged — but a long agent run
// in a worktree needs each of them (ADR-0009 §4):
//   - `cwd` scopes the agent's filesystem tools to a directory. For Explain that
//     is the throwaway worktree, which is half of the containment story.
//   - `timeoutMs` raises the ceiling for one call instead of raising the shared
//     default: an architect-grade review overruns three minutes, and a note
//     refine has no business waiting twenty.
export type ClaudeRunOptions = {
  readonly cwd?: string
  readonly timeoutMs?: number
  /** Kills the child when aborted — how a run in flight is cancelled. */
  readonly signal?: AbortSignal
}

// Runs the local claude CLI with the given args and stdin. Async so it never
// blocks the event loop. Injected into the pure modules so tests drive the flow
// with a fake and never spawn a process.
export type RunClaude = (
  args: readonly string[],
  stdin: string,
  options?: ClaudeRunOptions,
) => Promise<ClaudeRunResult>

// The local CLI is on the user's PATH (dev server started from a terminal).
// `CLASHBOARD_CLAUDE_BIN` overrides it for non-standard installs (and points the
// e2e suite at a stub that emits canned stream-json).
const CLAUDE_BIN = process.env.CLASHBOARD_CLAUDE_BIN ?? 'claude'
// 3 minutes: an Opus rewrite of a long note over a big transcript can take a
// while, and these are explicit user-initiated actions with a spinner.
const DEFAULT_TIMEOUT_MS = 180_000
// Guard against an unbounded reply eating memory (spawn, unlike spawnSync, has
// no built-in maxBuffer — we cap the collected output ourselves).
const MAX_BUFFER = 32 * 1024 * 1024

// The real runner: spawn the CLI, feed stdin, collect stdout/stderr, resolve on
// close or error. Never rejects — every failure becomes a `ClaudeRunResult` the
// pure parser turns into a tagged error, so callers get one uniform failure path.
export const spawnClaude: RunClaude = (args, stdin, options) =>
  new Promise((resolve) => {
    const child = spawnCli(args, options)
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result: ClaudeRunResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (stdout.length > MAX_BUFFER) child.kill()
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => finish({ status: null, stdout, stderr, error }))
    child.on('close', (code) => finish({ status: code, stdout, stderr }))
    // The child can exit before we finish writing stdin; swallow the EPIPE so it
    // surfaces as the real close/error result rather than an unhandled throw.
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
  })

function spawnCli(args: readonly string[], options: ClaudeRunOptions | undefined) {
  return spawn(CLAUDE_BIN, [...args], {
    timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options?.signal === undefined ? {} : { signal: options.signal }),
  })
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * One parsed `--output-format stream-json` line. Deliberately untyped beyond
 * "a JSON object": the CLI's event shape is not ours, and exactly one module
 * (`explain-agent.ts`) is allowed to know it, so a format change breaks one
 * translation rather than the whole feature (ADR-0009 §4).
 */
export type ClaudeStreamEvent = Readonly<Record<string, unknown>>

/**
 * A streaming run's outcome. Unlike `ClaudeRunResult` it carries **no stdout**:
 * stdout *is* the event stream, already delivered line by line, and a 20-minute
 * run's worth of it has no business sitting in memory a second time. The reply
 * text lives on the terminal event, which the caller's translation extracts.
 */
export type ClaudeStreamResult = {
  readonly status: number | null
  readonly stderr: string
  readonly error?: Error
  /** True when the run was killed through `options.signal`. */
  readonly aborted: boolean
}

export type StreamClaudeOptions = ClaudeRunOptions & {
  readonly onEvent: (event: ClaudeStreamEvent) => void
}

export type StreamClaude = (
  args: readonly string[],
  stdin: string,
  options: StreamClaudeOptions,
) => Promise<ClaudeStreamResult>

// Only the trailing *partial* line is buffered, so a malformed or enormous
// single line cannot grow without bound either.
const MAX_PARTIAL_LINE = 8 * 1024 * 1024

/**
 * Run the CLI in `stream-json` mode and hand each parsed line to `onEvent` as
 * it arrives. Sibling of `spawnClaude`, same never-rejects contract: a spawn
 * error, a non-zero exit, and an abort are all ordinary resolved results.
 *
 * Unparseable lines are dropped rather than failing the run — a stray warning on
 * stdout must not cost a ten-minute review.
 */
export const streamClaude: StreamClaude = (args, stdin, options) =>
  new Promise((resolve) => {
    const child = spawnCli(args, options)
    let stderr = ''
    let partial = ''
    let settled = false
    const finish = (result: ClaudeStreamResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const aborted = () => options.signal?.aborted === true

    const emit = (line: string) => {
      const trimmed = line.trim()
      if (trimmed === '') return
      let event: unknown
      try {
        event = JSON.parse(trimmed)
      } catch {
        return
      }
      if (typeof event !== 'object' || event === null || Array.isArray(event)) return
      options.onEvent(event as ClaudeStreamEvent)
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      partial += chunk
      let newline = partial.indexOf('\n')
      while (newline !== -1) {
        emit(partial.slice(0, newline))
        partial = partial.slice(newline + 1)
        newline = partial.indexOf('\n')
      }
      if (partial.length > MAX_PARTIAL_LINE) {
        partial = ''
        child.kill()
      }
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > MAX_BUFFER) stderr = stderr.slice(-MAX_BUFFER)
    })
    child.on('error', (error) => finish({ status: null, stderr, error, aborted: aborted() }))
    child.on('close', (code) => {
      // A final line with no trailing newline is still an event.
      emit(partial)
      partial = ''
      finish({ status: code, stderr, aborted: aborted() })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
  })

// Strip a SKILL.md's YAML frontmatter so only the instruction body rides in as
// the appended system prompt. Read fresh each run — skills are tiny and this
// keeps edits to them live without a server restart.
export async function loadSkillBody(skillPath: string): Promise<string> {
  const raw = await readFile(skillPath, 'utf8')
  const match = raw.match(/^---\n[\s\S]*?\n---\n?/u)
  return (match ? raw.slice(match[0].length) : raw).trim()
}

// Pull the first balanced top-level JSON object out of a string, tolerating
// stray prose or ```json fences around it and braces inside JSON strings.
// Returns null when no object is present.
export function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}
