// Answer a question about a ticket with a headless Claude agent. Sibling of
// `refine-note.ts`: same dependency-injected shape (an injected `RunClaude`), same
// shared CLI plumbing (`claude-cli.ts`), same grilling protocol (`refine-grilling`).
//
// The one deliberate divergence from Refine is containment. Refine runs
// `--restricted` — the agent gets NO tools, so it physically cannot touch anything.
// Ask must be able to FOLLOW LINKS to answer (fetch a URL, read a referenced Jira
// ticket), so `--restricted` is too tight (it strips Bash). Ask instead runs
// `--permission-mode dontAsk` (in headless mode this auto-denies every
// approval-gated action) plus an explicit READ-ONLY allowlist and a
// belt-and-suspenders deny-list. The guarantee shifts from "no tools" to "no
// mutations": the Ask session can read widely but can never write — not the note,
// not Jira, not a file.
//
// MCP is deliberately OFF in this spawn (`--strict-mcp-config` with no `--mcp-config`
// = zero MCP servers). Two reasons, measured on this machine: (1) loading the user's
// configured MCP servers adds ~30s to every spawn (~9s → ~39s); (2) a remote MCP's
// interactive OAuth (e.g. the Figma plugin authenticated via `/mcp`) does NOT persist
// to a `claude -p` subprocess — a fresh CLI process still reports it unauthenticated —
// so those tools cannot work here regardless. Inspecting Figma links from Ask is
// therefore deferred until MCP OAuth is reachable from the headless subprocess; when
// it is, add the Figma READ tools (`mcp__plugin_figma_figma__get_design_context`, …)
// back to the allowlist and drop `--strict-mcp-config`.

import { firstJsonObject, type ClaudeRunResult, type RunClaude } from './claude-cli'
import { parseQuestions, type RefineClarification, type RefineQuestion } from './refine-grilling'

// Re-exported so importers (server function, tests) have one import site, mirroring
// `refine-note.ts`.
export type { ClaudeRunResult, RunClaude } from './claude-cli'

export type AskInput = {
  // The local note as it stands (markdown, possibly empty). Read-only context.
  readonly note: string
  // The ticket description, flattened to text. Read-only context.
  readonly description: string
  // The ticket comments, flattened to text. Read-only context.
  readonly comments: string
  // The ticket's linked tickets, flattened to `relationship KEY — summary (status)`
  // lines. The agent can read any of them in full with read-only `acli`.
  readonly linkedTickets: string
  // The user's question — the thing to answer.
  readonly question: string
  // Answers to questions the agent asked in earlier grilling rounds. Empty/absent on
  // the first round; the loop re-runs with these folded in until the agent answers.
  readonly priorAnswers?: readonly RefineClarification[]
}

// The agent replies with EITHER an answer or a set of clarifying questions — never
// both. `kind` discriminates the two success shapes; every failure stays a tagged
// `{ ok: false }`.
export type AskParse =
  | { readonly ok: true; readonly kind: 'answer'; readonly answer: string }
  | { readonly ok: true; readonly kind: 'questions'; readonly questions: readonly RefineQuestion[] }
  | { readonly ok: false; readonly error: { readonly message: string } }

// The model alias resolved by the local CLI to the latest Opus.
export const ASK_MODEL = 'opus'

// Read-only tools the Ask agent may use to follow links. Web fetch/search for public
// URLs; scoped `acli` READ subcommands for referenced Jira tickets. Nothing here can
// mutate anything. (No MCP tools — MCP is off in this spawn; see the module header.)
export const ASK_ALLOWED_TOOLS: readonly string[] = [
  'WebFetch',
  'WebSearch',
  'Bash(acli jira workitem view:*)',
  'Bash(acli jira workitem search:*)',
  'Bash(acli jira field search:*)',
  'Bash(acli jira project view:*)',
]

// Belt-and-suspenders: `dontAsk` already denies everything not on the allowlist, but
// naming the write-shaped tools explicitly makes the "never writes" contract legible
// and survives a future loosening of the allowlist.
export const ASK_DISALLOWED_TOOLS: readonly string[] = [
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Bash(acli jira workitem create:*)',
  'Bash(acli jira workitem edit:*)',
  'Bash(acli jira workitem transition:*)',
  'Bash(acli jira workitem delete:*)',
  'Bash(acli jira workitem comment:*)',
  'Bash(acli jira workitem assign:*)',
]

// Print mode, machine-readable envelope, read-only tools only. The skill body (how to
// answer + when to grill) rides in as the appended system prompt; the data + task go
// in on stdin. `--strict-mcp-config` (with no `--mcp-config`) loads zero MCP servers —
// the ~30s startup saving that keeps Ask snappy; see the module header. `--allowedTools`
// /`--disallowedTools` are variadic, so each tool is its own argv element; a following
// non-variadic flag terminates the allowlist's run.
export function askClaudeArgs(skillBody: string): string[] {
  return [
    '-p',
    '--append-system-prompt',
    skillBody,
    '--model',
    ASK_MODEL,
    '--output-format',
    'json',
    '--permission-mode',
    'dontAsk',
    '--strict-mcp-config',
    '--allowedTools',
    ...ASK_ALLOWED_TOOLS,
    '--disallowedTools',
    ...ASK_DISALLOWED_TOOLS,
  ]
}

function section(title: string, body: string): string {
  const trimmed = body.trim()
  return `## ${title}\n${trimmed === '' ? '(none)' : trimmed}`
}

// The stdin prompt: the context under clear headings, then the question. The skill
// (system prompt) carries the behaviour and the output contract, so this stays data +
// a one-line instruction. Earlier rounds' answers ride in as a PRIOR CLARIFICATIONS
// section so the agent doesn't re-ask them.
export function buildAskPrompt(input: AskInput): string {
  const priorAnswers = input.priorAnswers ?? []
  return [
    'Answer the question below from the ticket context, following your instructions.',
    '',
    section('NOTE (the user’s private working note)', input.note),
    '',
    section('DESCRIPTION (ticket description)', input.description),
    '',
    section('COMMENTS (ticket comments)', input.comments),
    '',
    section('LINKED TICKETS (read any in full with acli if useful)', input.linkedTickets),
    '',
    section('QUESTION (answer this)', input.question),
    ...(priorAnswers.length > 0
      ? [
          '',
          section(
            'PRIOR CLARIFICATIONS (already answered — treat as settled, do not ask again)',
            priorAnswers.map((p) => `Q: ${p.question}\nA: ${p.answer}`).join('\n\n'),
          ),
        ]
      : []),
    '',
    'Return only the JSON object described in your instructions.',
  ].join('\n')
}

// Parse the CLI's `--output-format json` envelope, then the agent's own reply out of
// its `result` text. Every failure path (process error, non-zero exit, agent error,
// unparseable reply) becomes a tagged `{ ok: false }` the caller surfaces as a toast —
// never a throw. Mirrors `parseRefineResult`.
export function parseAskResult(run: ClaudeRunResult): AskParse {
  if (run.error !== undefined) {
    return fail(`could not run the ask agent: ${run.error.message}`)
  }
  if (run.status !== 0) {
    const detail = run.stderr.trim() || run.stdout.trim() || `exit code ${run.status ?? 'unknown'}`
    return fail(`ask agent exited with an error: ${detail}`)
  }

  let envelope: { is_error?: boolean; result?: unknown }
  try {
    envelope = JSON.parse(run.stdout) as typeof envelope
  } catch {
    return fail('ask agent returned output that was not valid JSON')
  }
  if (envelope.is_error === true || typeof envelope.result !== 'string') {
    return fail('ask agent reported an error instead of a result')
  }

  const objectText = firstJsonObject(envelope.result)
  if (objectText === null) return fail('ask agent did not return an answer object')

  let content: { answer?: unknown; questions?: unknown }
  try {
    content = JSON.parse(objectText) as typeof content
  } catch {
    return fail('ask agent returned a malformed answer object')
  }
  // A questions reply means the question was ambiguous: the agent asks before it
  // guesses. Checked first — a well-formed questions object has no `answer`.
  if ('questions' in content) {
    const questions = parseQuestions(content.questions)
    if (questions === null) return fail('ask agent returned an empty or malformed questions list')
    return { ok: true, kind: 'questions', questions }
  }
  if (typeof content.answer !== 'string' || content.answer.trim() === '') {
    return fail('ask agent returned an answer object missing `answer`')
  }
  return { ok: true, kind: 'answer', answer: content.answer }
}

function fail(message: string): AskParse {
  return { ok: false, error: { message } }
}

// Build the prompt, run the agent, parse the reply. The caller (server function)
// supplies the fetched context, the skill body, and the real spawn. Nothing is
// written on any path — Ask is read-only end to end.
export async function runAsk(
  input: AskInput & { readonly skillBody: string },
  run: RunClaude,
): Promise<AskParse> {
  const args = askClaudeArgs(input.skillBody)
  const prompt = buildAskPrompt(input)
  return parseAskResult(await run(args, prompt))
}
