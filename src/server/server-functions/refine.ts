import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { appRuntime } from '../runtime/app-runtime'
import { adfToText } from '../lib/adf-to-text'
import { assertIssueKey } from '../lib/jql'
import { commentsToText, issueContextProgram } from '../lib/agent-ticket-context'
import { loadSkillBody, spawnClaude } from '../lib/claude-cli'
import { parsePriorAnswers, type RefineQuestion } from '../lib/refine-grilling'
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
