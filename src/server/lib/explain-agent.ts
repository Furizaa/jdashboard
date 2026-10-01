// The Explain agent: argv, prompt, and the one translation of the CLI's
// `stream-json` output into something a human can watch.
//
// Sibling of `ask-ticket.ts` and inherits its containment posture, widened to
// filesystem reads and scoped by `cwd` to the throwaway worktree (ADR-0009 §6):
// `--permission-mode dontAsk` (in headless mode this auto-denies every
// approval-gated action), `--strict-mcp-config` with no `--mcp-config` (zero MCP
// servers — ~30s off every spawn, and headless OAuth does not persist anyway),
// an explicit read-only allowlist, and a belt-and-suspenders deny list naming
// every write-shaped tool and every mutating subcommand.
//
// **Nothing is written by the agent at all.** The report comes back on stdout and
// clashboard persists it. That containment is structural — no allowed tool can
// mutate anything, and the worktree it can reach is one clashboard throws away —
// rather than a convention the agent is trusted to follow.
//
// This module is also the **only** place that knows the shape of a `stream-json`
// event. A CLI output-format change therefore breaks `activityFor` /
// `finalReplyFrom` and nothing else: the registry, the SSE route, and the view
// all deal in `ExplainActivity`, which is ours.

import type { ClaudeStreamEvent } from './claude-cli'

export type { ClaudeStreamEvent, ClaudeStreamResult, StreamClaude } from './claude-cli'

/** The model alias the local CLI resolves to the latest Opus. */
export const EXPLAIN_MODEL = 'opus'

/**
 * 20 minutes. An architect-grade review of a real merge request walks history,
 * reads neighbours, and writes a structured report; three minutes (the shared
 * default) is not enough, and the run is watchable the whole time, so a long
 * ceiling costs the user nothing but patience they can see being spent.
 */
export const EXPLAIN_TIMEOUT_MS = 20 * 60_000

/**
 * Read-only tools, enough to review a change properly: the worktree's files,
 * its history, the MR thread, the ticket, and the public web. Nothing here can
 * mutate anything. `Read`/`Grep`/`Glob` are scoped to the worktree by the run's
 * `cwd`, which is why they can be allowed at all.
 */
export const EXPLAIN_ALLOWED_TOOLS: readonly string[] = [
  'Read',
  'Grep',
  'Glob',
  'Bash(git log:*)',
  'Bash(git blame:*)',
  'Bash(git diff:*)',
  'Bash(git show:*)',
  'Bash(git rev-parse:*)',
  'Bash(git rev-list:*)',
  'Bash(git ls-files:*)',
  'Bash(glab mr view:*)',
  'Bash(glab mr diff:*)',
  'Bash(acli jira workitem view:*)',
  'Bash(acli jira workitem search:*)',
  'WebFetch',
  'WebSearch',
]

/**
 * `dontAsk` already denies everything not on the allowlist. Naming the
 * write-shaped tools and every mutating subcommand explicitly makes the "never
 * writes" contract legible, and survives a future loosening of the allowlist.
 */
export const EXPLAIN_DISALLOWED_TOOLS: readonly string[] = [
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Bash(git add:*)',
  'Bash(git commit:*)',
  'Bash(git push:*)',
  'Bash(git checkout:*)',
  'Bash(git switch:*)',
  'Bash(git restore:*)',
  'Bash(git reset:*)',
  'Bash(git rebase:*)',
  'Bash(git merge:*)',
  'Bash(git cherry-pick:*)',
  'Bash(git clean:*)',
  'Bash(git apply:*)',
  'Bash(git stash:*)',
  'Bash(git tag:*)',
  'Bash(git branch:*)',
  'Bash(git worktree:*)',
  'Bash(git config:*)',
  'Bash(glab mr create:*)',
  'Bash(glab mr update:*)',
  'Bash(glab mr merge:*)',
  'Bash(glab mr approve:*)',
  'Bash(glab mr revoke:*)',
  'Bash(glab mr note:*)',
  'Bash(glab mr close:*)',
  'Bash(acli jira workitem create:*)',
  'Bash(acli jira workitem edit:*)',
  'Bash(acli jira workitem transition:*)',
  'Bash(acli jira workitem delete:*)',
  'Bash(acli jira workitem comment:*)',
  'Bash(acli jira workitem assign:*)',
]

/**
 * Print mode, streamed machine-readable events, read-only tools only. The skill
 * body (the review philosophy and the output contract) rides in as the appended
 * system prompt; the data and the task go in on stdin.
 *
 * `stream-json` requires `--verbose`. `--allowedTools` / `--disallowedTools` are
 * variadic, so each tool is its own argv element and the following non-variadic
 * flag terminates the run.
 */
export function explainClaudeArgs(skillBody: string): string[] {
  return [
    '-p',
    '--append-system-prompt',
    skillBody,
    '--model',
    EXPLAIN_MODEL,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'dontAsk',
    '--strict-mcp-config',
    '--allowedTools',
    ...EXPLAIN_ALLOWED_TOOLS,
    '--disallowedTools',
    ...EXPLAIN_DISALLOWED_TOOLS,
  ]
}

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

export type ExplainMrContext = {
  readonly iid: number
  readonly title: string
  readonly description: string
  readonly webUrl: string
  readonly sourceBranch: string
  readonly targetBranch: string
  readonly headSha: string
  /** One block per thread, system notes already filtered out. */
  readonly discussions: string
}

export type ExplainTicketContext = {
  readonly key: string | null
  readonly summary: string
  readonly description: string
  readonly comments: string
  /** The user's private local note for the ticket, markdown, possibly empty. */
  readonly note: string
}

export type ExplainPromptInput = {
  readonly mr: ExplainMrContext
  readonly ticket: ExplainTicketContext
  /** Where the detached worktree is checked out — the agent's whole world. */
  readonly worktreePath: string
}

/**
 * The diff range the agent should treat as "the change". Taken from the MR's own
 * target branch rather than assumed to be `develop`, because not every MR
 * targets it — and `...` (not `..`) so a busy target branch's unrelated commits
 * do not show up as part of the change.
 */
export function explainDiffRange(targetBranch: string, headSha: string): string {
  return `origin/${targetBranch}...${headSha}`
}

function section(title: string, body: string): string {
  const trimmed = body.trim()
  return `## ${title}\n${trimmed === '' ? '(none)' : trimmed}`
}

export function buildExplainPrompt(input: ExplainPromptInput): string {
  const { mr, ticket } = input
  const range = explainDiffRange(mr.targetBranch, mr.headSha)
  return [
    'Review the merge request below as the architect of the system it lands in, following your instructions.',
    '',
    section(
      'MERGE REQUEST',
      [
        `!${mr.iid} — ${mr.title}`,
        `${mr.sourceBranch} → ${mr.targetBranch}`,
        `head: ${mr.headSha}`,
        `url: ${mr.webUrl}`,
      ].join('\n'),
    ),
    '',
    section('MR DESCRIPTION (what the author says this does)', mr.description),
    '',
    section('MR DISCUSSION (review threads so far)', mr.discussions),
    '',
    section('TICKET', ticket.key === null ? '' : `${ticket.key} — ${ticket.summary}`.trim()),
    '',
    section('TICKET DESCRIPTION', ticket.description),
    '',
    section('TICKET COMMENTS', ticket.comments),
    '',
    section('LOCAL NOTE (the reviewer’s private working note)', ticket.note),
    '',
    section(
      'THE CHANGE (this is what you are reviewing)',
      [
        `You are running inside a detached git worktree at ${input.worktreePath}, checked out at the MR's head commit.`,
        `The change is the diff range \`${range}\`. Start there.`,
        'The whole repository is readable, and its history is readable, so you can see what the change lands in — not just what it touches.',
        'There are no dependencies installed and nothing is built: you cannot install, build, typecheck, or run tests. Say what that left unverified instead of implying you ran anything.',
      ].join('\n'),
    ),
    '',
    'Return only the JSON report object described in your instructions.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Stream translation — the contract
// ---------------------------------------------------------------------------

/**
 * One coarse line of "what the agent is doing right now". Raw stream-json never
 * reaches the browser; this is the vocabulary the tab renders, so the CLI's
 * event shape stops at this module's edge.
 */
export type ExplainActivityKind =
  | 'start'
  | 'read'
  | 'search'
  | 'list'
  | 'shell'
  | 'web'
  | 'thought'
  | 'tool'

export type ExplainActivity = {
  readonly kind: ExplainActivityKind
  readonly text: string
}

// A thought or a command is for glancing at, not reading. Long ones are cut.
const MAX_ACTIVITY_TEXT = 160

function clip(text: string): string {
  const flat = text.replaceAll(/\s+/gu, ' ').trim()
  return flat.length <= MAX_ACTIVITY_TEXT ? flat : `${flat.slice(0, MAX_ACTIVITY_TEXT - 1)}…`
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {}
}

/** `path` relative to the worktree reads better than the absolute one. */
function relativeTo(path: string, worktreePath: string | undefined): string {
  if (worktreePath === undefined || worktreePath === '') return path
  const prefix = worktreePath.endsWith('/') ? worktreePath : `${worktreePath}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function activityForToolUse(
  name: string,
  input: Readonly<Record<string, unknown>>,
  worktreePath: string | undefined,
): ExplainActivity | null {
  switch (name) {
    case 'Read': {
      const path = str(input.file_path)
      return path === '' ? null : { kind: 'read', text: relativeTo(path, worktreePath) }
    }
    case 'Grep': {
      const pattern = str(input.pattern)
      return pattern === '' ? null : { kind: 'search', text: clip(pattern) }
    }
    case 'Glob': {
      const pattern = str(input.pattern)
      return pattern === '' ? null : { kind: 'list', text: clip(pattern) }
    }
    case 'Bash': {
      const command = str(input.command)
      return command === '' ? null : { kind: 'shell', text: clip(command) }
    }
    case 'WebFetch': {
      const url = str(input.url)
      return url === '' ? null : { kind: 'web', text: clip(url) }
    }
    case 'WebSearch': {
      const query = str(input.query)
      return query === '' ? null : { kind: 'web', text: clip(query) }
    }
    // A tool we did not allow, or one added to the CLI since: name it rather
    // than drop it, so an unexpected capability shows up in the log.
    default:
      return name === '' ? null : { kind: 'tool', text: name }
  }
}

/**
 * One stream-json event → one activity line, or `null` when the event has
 * nothing a human would want to see (a tool result, the terminal envelope,
 * an unrecognised event kind).
 *
 * The assistant's prose becomes a `thought` line: a multi-minute wait is far
 * more tolerable when you can see what it is concluding, not only which files
 * it opened.
 */
export function activityFor(
  event: ClaudeStreamEvent,
  options: { readonly worktreePath?: string } = {},
): ExplainActivity | null {
  const type = str(event.type)
  if (type === 'system') {
    return str(event.subtype) === 'init' ? { kind: 'start', text: 'Reading the change' } : null
  }
  if (type !== 'assistant') return null

  const content = record(event.message).content
  if (!Array.isArray(content)) return null
  // One line per event: the first interesting part wins. A tool call outranks
  // the prose beside it, because that is the thing actually happening.
  const parts = content.map(record)
  const toolUse = parts.find((part) => str(part.type) === 'tool_use')
  if (toolUse !== undefined) {
    return activityForToolUse(str(toolUse.name), record(toolUse.input), options.worktreePath)
  }
  const text = parts.find((part) => str(part.type) === 'text')
  if (text === undefined) return null
  const body = str(text.text).trim()
  return body === '' ? null : { kind: 'thought', text: clip(body) }
}

/**
 * The agent's final reply text, pulled off the terminal `result` event — the
 * thing `parseExplainReport` validates. `null` when the stream ended without one
 * (killed, crashed, or the CLI reported its own error), which the registry turns
 * into a terminal `failed` phase.
 */
export function finalReplyFrom(events: readonly ClaudeStreamEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event === undefined || str(event.type) !== 'result') continue
    if (event.is_error === true) return null
    const reply = str(event.result)
    return reply === '' ? null : reply
  }
  return null
}

/** The CLI's own error text on the terminal event, when it reported one. */
export function streamErrorFrom(events: readonly ClaudeStreamEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event === undefined || str(event.type) !== 'result') continue
    if (event.is_error !== true) return null
    const detail = str(event.result).trim()
    return detail === '' ? 'the explain agent reported an error' : clip(detail)
  }
  return null
}
