// Refine a ticket's private note with a headless Claude agent. Same plain,
// dependency-injected shape as `open-workspace` and `notes-store`: the process
// runs on the user's own always-authenticated machine, so we shell out to the
// local `claude` CLI in print mode rather than calling an API with a key. The
// injected `RunClaude` makes the whole flow unit-testable with a fake.
//
// The agent never touches the ticket, its comments, or any file: it is run with
// `--restricted` (no Bash/file tools) and handed everything it needs as text on
// stdin. It replies with text only; this module parses that reply and the caller
// writes the note and changelog to disk. That containment is the design, not a
// convention the agent is trusted to follow.

import { firstJsonObject, type ClaudeRunResult, type RunClaude } from './claude-cli'
import { parseQuestions, type RefineClarification, type RefineQuestion } from './refine-grilling'

// Re-exported so existing importers (server function, tests) keep their import
// site; the types now live in `claude-cli` alongside the shared runner.
export type { ClaudeRunResult, RunClaude } from './claude-cli'

export type RefineInput = {
  // The note as it stands (markdown, possibly empty).
  readonly note: string
  // The ticket description, flattened to text. Read-only context for the agent.
  readonly description: string
  // The ticket comments, flattened to text. Read-only context for the agent.
  readonly comments: string
  // Pasted transcript / instruction — the newest signal driving the rewrite.
  readonly refineText: string
  // Answers to questions the agent asked in earlier rounds (see `refine-grilling`).
  // Empty / absent on the first round; the loop keeps re-running with these folded
  // in until the agent has enough to write the note.
  readonly priorAnswers?: readonly RefineClarification[]
}

// The agent replies with EITHER a rewritten note or a set of clarifying
// questions — never both. `kind` discriminates the two success shapes; every
// failure path stays a tagged `{ ok: false }`.
export type RefineParse =
  | { readonly ok: true; readonly kind: 'note'; readonly notes: string; readonly changelog: string }
  | { readonly ok: true; readonly kind: 'questions'; readonly questions: readonly RefineQuestion[] }
  | { readonly ok: false; readonly error: { readonly message: string } }

// The model alias resolved by the local CLI to the latest Opus.
export const REFINE_MODEL = 'opus'

// Print mode, machine-readable envelope, and — critically — no tools. The skill
// body (how to refine) rides in as an appended system prompt; the data + task go
// in on stdin, keeping the two concerns separate.
export function refineClaudeArgs(skillBody: string): string[] {
  return [
    '-p',
    '--append-system-prompt',
    skillBody,
    '--model',
    REFINE_MODEL,
    '--output-format',
    'json',
    '--restricted',
  ]
}

function section(title: string, body: string): string {
  const trimmed = body.trim()
  return `## ${title}\n${trimmed === '' ? '(none)' : trimmed}`
}

// The stdin prompt: the four inputs under clear headings, then the task. The
// skill (system prompt) already carries the philosophy and the output contract,
// so this stays data + a one-line instruction. When earlier rounds resolved an
// ambiguity, those answers ride in as a fifth section so the agent doesn't ask
// them again.
export function buildRefinePrompt(input: RefineInput): string {
  const priorAnswers = input.priorAnswers ?? []
  return [
    'Rewrite the ticket note from the inputs below, following your instructions.',
    '',
    section('NOTE (rewrite this)', input.note),
    '',
    section('DESCRIPTION (context, do not edit)', input.description),
    '',
    section('COMMENTS (context, do not edit)', input.comments),
    '',
    section('REFINE (the new input to fold in)', input.refineText),
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

// Parse the CLI's `--output-format json` envelope, then the agent's own
// `{ notes, changelog }` reply out of its `result` text. Every failure path
// (process error, non-zero exit, agent error, unparseable reply) becomes a
// tagged `{ ok: false }` the caller surfaces as a toast — never a throw.
export function parseRefineResult(run: ClaudeRunResult): RefineParse {
  if (run.error !== undefined) {
    return fail(`could not run the refine agent: ${run.error.message}`)
  }
  if (run.status !== 0) {
    const detail = run.stderr.trim() || run.stdout.trim() || `exit code ${run.status ?? 'unknown'}`
    return fail(`refine agent exited with an error: ${detail}`)
  }

  let envelope: { is_error?: boolean; result?: unknown }
  try {
    envelope = JSON.parse(run.stdout) as typeof envelope
  } catch {
    return fail('refine agent returned output that was not valid JSON')
  }
  if (envelope.is_error === true || typeof envelope.result !== 'string') {
    return fail('refine agent reported an error instead of a result')
  }

  const objectText = firstJsonObject(envelope.result)
  if (objectText === null) return fail('refine agent did not return a notes object')

  let content: { notes?: unknown; changelog?: unknown; questions?: unknown }
  try {
    content = JSON.parse(objectText) as typeof content
  } catch {
    return fail('refine agent returned a malformed notes object')
  }
  // A questions reply means the transcript was ambiguous: the agent is asking
  // before it guesses. Checked first — a well-formed questions object has no
  // `notes`/`changelog` to fall through to.
  if ('questions' in content) {
    const questions = parseQuestions(content.questions)
    if (questions === null)
      return fail('refine agent returned an empty or malformed questions list')
    return { ok: true, kind: 'questions', questions }
  }
  if (typeof content.notes !== 'string' || typeof content.changelog !== 'string') {
    return fail('refine agent returned a notes object missing `notes` or `changelog`')
  }
  return { ok: true, kind: 'note', notes: content.notes, changelog: content.changelog }
}

function fail(message: string): RefineParse {
  return { ok: false, error: { message } }
}

// Build the prompt, run the agent, parse the reply. The caller (server function)
// supplies the fetched inputs, the skill body, and the real spawn; on success it
// persists `notes` and appends `changelog`.
export async function runRefine(
  input: RefineInput & { readonly skillBody: string },
  run: RunClaude,
): Promise<RefineParse> {
  const args = refineClaudeArgs(input.skillBody)
  const prompt = buildRefinePrompt(input)
  return parseRefineResult(await run(args, prompt))
}
