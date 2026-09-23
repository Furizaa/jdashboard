import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import type { DetailIssue } from '../gateways/jira/types'
import { DetailConfigLive } from '../contexts/detail/config'
import { loadIssue } from '../contexts/detail/application/load-issue'
import { appRuntime } from '../runtime/app-runtime'
import { adfToText } from '../lib/adf-to-text'
import { assertIssueKey } from '../lib/jql'
import { loadSkillBody, spawnClaude } from '../lib/claude-cli'
import type { RefineClarification, RefineQuestion } from '../lib/refine-grilling'
import { readNote, writeNote, type NotesStoreDeps } from '../lib/notes-store'
import {
  appendChangelog,
  readChangelog,
  type ChangelogEntry,
  type ChangelogStoreDeps,
} from '../lib/notes-changelog-store'
import { runRefine } from '../lib/refine-note'

// The Refine feature. Unlike the other note handlers this one is not pure disk
// I/O: it fetches the ticket's description + comments (reusing Detail's
// `loadIssue` Effect program) as read-only context, hands note + context + the
// user's pasted text to a headless `claude` agent, then writes the rewritten note
// and appends an automated-changelog entry. The Jira read degrades to empty
// context on failure so a Jira hiccup never blocks refining from pasted text.

export type RefineNoteResult =
  // `note` is the rewritten markdown, returned so the editor can adopt it
  // immediately rather than waiting on (and racing) the note query's refetch.
  | { readonly ok: true; readonly kind: 'note'; readonly note: string }
  // The transcript was ambiguous: the agent asks before it guesses. Nothing is
  // written; the UI collects answers and calls again with them (see
  // `refine-grilling`). `round` is the 1-based round these questions belong to.
  | {
      readonly ok: true
      readonly kind: 'questions'
      readonly round: number
      readonly questions: readonly RefineQuestion[]
    }
  | { readonly ok: false; readonly error: { readonly message: string } }

export type GetChangelogResult = { readonly entries: readonly ChangelogEntry[] }

const SKILL_PATH = join(process.cwd(), '.claude', 'skills', 'refine-ticket-notes', 'SKILL.md')

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Answers from earlier grilling rounds, sanitised: each must be a
// `{ question, answer }` pair of non-empty strings. Anything else is dropped so a
// malformed client payload degrades to "no clarifications" rather than throwing.
function parsePriorAnswers(value: unknown): RefineClarification[] {
  if (!Array.isArray(value)) return []
  const pairs: RefineClarification[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const p = item as Record<string, unknown>
    const question = str(p.question).trim()
    const answer = str(p.answer).trim()
    if (question !== '' && answer !== '') pairs.push({ question, answer })
  }
  return pairs
}

function notesStoreDeps(): NotesStoreDeps & ChangelogStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, data) => writeFile(p, data, 'utf8'),
    mkdir: (p) => mkdir(p, { recursive: true }).then(() => {}),
    // Used by `writeNote` only when the agent refines the note down to empty.
    deleteFile: (p) => unlink(p),
    readDir: () => Promise.resolve([]),
  }
}

// Fetch the ticket for context, degrading to null (empty context) on any Jira
// failure — description/comments only inform the rewrite; they never gate it.
const issueContextProgram = (key: string) =>
  loadIssue(key).pipe(
    Effect.provide(DetailConfigLive),
    Effect.map((ok): DetailIssue | null => ok.issue),
    Effect.catchAll(() => Effect.succeed<DetailIssue | null>(null)),
  )

function commentsToText(issue: DetailIssue | null): string {
  if (issue === null) return ''
  return issue.comments
    .map((c) => {
      const who = c.authorName ?? 'Unknown'
      const body = adfToText(c.body)
      return body === '' ? '' : `${who} (${c.created}):\n${body}`
    })
    .filter((block) => block !== '')
    .join('\n\n')
}

export const refineNote = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { key: string; refineText: string; priorAnswers?: unknown; round?: unknown }) => {
      const refineText = str(data?.refineText).trim()
      if (refineText === '') throw new Error('refineNote (refineText): required')
      const round = typeof data?.round === 'number' && Number.isFinite(data.round) ? data.round : 1
      return {
        key: assertIssueKey(str(data?.key), 'refineNote'),
        refineText,
        priorAnswers: parsePriorAnswers(data?.priorAnswers),
        round,
      }
    },
  )
  .handler(async ({ data }): Promise<RefineNoteResult> => {
    let skillBody: string
    try {
      skillBody = await loadSkillBody(SKILL_PATH)
    } catch {
      return { ok: false, error: { message: 'refine skill is missing from the app install' } }
    }

    const deps = notesStoreDeps()
    const issue = await appRuntime.runPromise(issueContextProgram(data.key))
    const note = await readNote(data.key, deps)

    const parsed = await runRefine(
      {
        note,
        description: adfToText(issue?.description ?? null),
        comments: commentsToText(issue),
        refineText: data.refineText,
        priorAnswers: data.priorAnswers,
        skillBody,
      },
      spawnClaude,
    )
    if (!parsed.ok) return parsed

    // Ambiguous transcript: hand the questions back, write nothing. The client
    // collects answers and calls again with them folded into `priorAnswers`.
    if (parsed.kind === 'questions') {
      return { ok: true, kind: 'questions', round: data.round, questions: parsed.questions }
    }

    try {
      await writeNote(data.key, parsed.notes, deps)
      await appendChangelog(
        data.key,
        { at: new Date().toISOString(), summary: parsed.changelog },
        deps,
      )
    } catch (e) {
      return { ok: false, error: { message: e instanceof Error ? e.message : 'unknown error' } }
    }
    return { ok: true, kind: 'note', note: parsed.notes }
  })

export const getChangelog = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => ({
    key: assertIssueKey(str(data?.key), 'getChangelog'),
  }))
  .handler(
    async ({ data }): Promise<GetChangelogResult> => ({
      entries: await readChangelog(data.key, notesStoreDeps()),
    }),
  )
