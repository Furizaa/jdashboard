import { join } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import type { DetailIssue, IssueLink } from '../gateways/jira/types'
import { appRuntime } from '../runtime/app-runtime'
import { adfToText } from '../lib/adf-to-text'
import { assertIssueKey } from '../lib/jql'
import { commentsToText, issueContextProgram, readOnlyNotesDeps } from '../lib/agent-ticket-context'
import { loadSkillBody, spawnClaude } from '../lib/claude-cli'
import { parsePriorAnswers, type RefineQuestion } from '../lib/refine-grilling'
import { readNote } from '../lib/notes-store'
import { runAsk } from '../lib/ask-ticket'

// The Ask feature: answer a question about a ticket with a headless `claude` agent.
// Like Refine (`refine.ts`) it fetches read-only context (the local note, the ticket
// description + comments + linked tickets, reusing Detail's `loadIssue` Effect
// program) and hands it to the agent — but UNLIKE Refine it writes nothing, ever.
// The agent runs read-only (`ask-ticket.ts` sets `--permission-mode dontAsk` with a
// read-only allowlist) so it can follow links to answer, and this handler only ever
// returns the answer (or clarifying questions); no path touches disk or Jira.
//
// The small context helpers are duplicated from `refine.ts` rather than shared: that
// file is mid-flight (uncommitted grill work) and per-context duplication is tolerated
// here — this keeps the two AI features decoupled.

export type AskTicketResult =
  // `answer` is markdown, rendered read-only in the modal. The user can copy it or
  // hand it to Refine — Ask itself never persists it.
  | { readonly ok: true; readonly kind: 'answer'; readonly answer: string }
  // The question was ambiguous: the agent asks before it guesses (same grilling
  // protocol as Refine). Nothing is written; the UI collects answers and calls again
  // with them. `round` is the 1-based round these questions belong to.
  | {
      readonly ok: true
      readonly kind: 'questions'
      readonly round: number
      readonly questions: readonly RefineQuestion[]
    }
  | { readonly ok: false; readonly error: { readonly message: string } }

const SKILL_PATH = join(process.cwd(), '.claude', 'skills', 'ask-ticket', 'SKILL.md')

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// One line per linked ticket: `relationship KEY — summary (status)`. The relationship
// word (from the link's inward/outward phrasing) tells the agent how the tickets
// relate; the key lets it read any of them in full via read-only `acli`.
function linkedTicketsToText(issue: DetailIssue | null): string {
  if (issue === null) return ''
  return issue.links
    .map((link: IssueLink) => {
      const status = link.issue.statusName === '' ? '' : ` (${link.issue.statusName})`
      return `${link.relationship} ${link.issue.key} — ${link.issue.summary}${status}`
    })
    .join('\n')
}

export const askTicket = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { key: string; question: string; priorAnswers?: unknown; round?: unknown }) => {
      const question = str(data?.question).trim()
      if (question === '') throw new Error('askTicket (question): required')
      const round = typeof data?.round === 'number' && Number.isFinite(data.round) ? data.round : 1
      return {
        key: assertIssueKey(str(data?.key), 'askTicket'),
        question,
        priorAnswers: parsePriorAnswers(data?.priorAnswers),
        round,
      }
    },
  )
  .handler(async ({ data }): Promise<AskTicketResult> => {
    let skillBody: string
    try {
      skillBody = await loadSkillBody(SKILL_PATH)
    } catch {
      return { ok: false, error: { message: 'ask skill is missing from the app install' } }
    }

    const issue = await appRuntime.runPromise(issueContextProgram(data.key))
    const note = await readNote(data.key, readOnlyNotesDeps('ask'))

    const parsed = await runAsk(
      {
        note,
        description: adfToText(issue?.description ?? null),
        comments: commentsToText(issue),
        linkedTickets: linkedTicketsToText(issue),
        question: data.question,
        priorAnswers: data.priorAnswers,
        skillBody,
      },
      spawnClaude,
    )
    if (!parsed.ok) return parsed

    // Ambiguous question: hand the questions back with the round they belong to. The
    // client collects answers and calls again with them folded into `priorAnswers`.
    if (parsed.kind === 'questions') {
      return { ok: true, kind: 'questions', round: data.round, questions: parsed.questions }
    }
    return { ok: true, kind: 'answer', answer: parsed.answer }
  })
