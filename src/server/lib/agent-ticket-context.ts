import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { Effect } from 'effect'
import type { DetailIssue } from '../gateways/jira/types'
import { DetailConfigLive } from '../contexts/detail/config'
import { loadIssue } from '../contexts/detail/application/load-issue'
import { adfToText } from './adf-to-text'
import type { NotesStoreDeps } from './notes-store'

// The read-only ticket context an agent prompt is built from, shared by the
// three surfaces that build one: Refine, Ask and Explain.
//
// All three need the same two things — the ticket, and its comments as plain
// text — and two of them need notes deps that cannot write. Each had its own
// copy, which is three places for one rule about how a Jira failure degrades.

/**
 * Fetch the ticket for context, degrading to `null` (empty context) on any Jira
 * failure. The ticket *informs* the prompt and never gates it: a description and
 * its comments make a better answer, but their absence is not a reason to
 * refuse to run.
 */
export const issueContextProgram = (key: string) =>
  loadIssue(key).pipe(
    Effect.provide(DetailConfigLive),
    Effect.map((ok): DetailIssue | null => ok.issue),
    Effect.catchAll(() => Effect.succeed<DetailIssue | null>(null)),
  )

/** The ticket's comments as plain text, one `who (when): body` block each. */
export function commentsToText(issue: DetailIssue | null): string {
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

/**
 * Notes deps that can only read. The write, dir and delete hooks reject rather
 * than being absent, so a surface that claims never to write the note — Ask and
 * Explain both do — makes that contract **structural** instead of a promise:
 * the capability is not there to misuse.
 *
 * `surface` names the caller in the rejection, so a stray write is traceable to
 * whichever surface attempted it.
 */
export function readOnlyNotesDeps(surface: string): NotesStoreDeps {
  const refuse = () => Promise.reject(new Error(`${surface} is read-only`))
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: refuse,
    mkdir: refuse,
    deleteFile: refuse,
    readDir: () => Promise.resolve([]),
  }
}
