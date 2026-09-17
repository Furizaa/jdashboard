// Shared plumbing for clashboard's headless-Claude features (note Refine and
// bulk-refine transcript routing). Both shell out to the local `claude` CLI in
// print mode on the user's own always-authenticated machine — no API key — and
// both parse the same `--output-format json` envelope. This module owns the two
// concerns they share: running the CLI, and pulling one JSON object out of the
// agent's reply.
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

// Runs the local claude CLI with the given args and stdin. Async so it never
// blocks the event loop. Injected into the pure modules so tests drive the flow
// with a fake and never spawn a process.
export type RunClaude = (args: readonly string[], stdin: string) => Promise<ClaudeRunResult>

// The local CLI is on the user's PATH (dev server started from a terminal).
// `CLASHBOARD_CLAUDE_BIN` overrides it for non-standard installs.
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
export const spawnClaude: RunClaude = (args, stdin) =>
  new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, [...args], { timeout: DEFAULT_TIMEOUT_MS })
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
