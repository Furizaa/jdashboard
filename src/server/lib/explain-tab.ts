// What one Explain tab is, and the pure rules that build one.
//
// A tab has two sources that can disagree: the **file** (`explain-store`), which
// is the open set and survives everything, and the **live run**
// (`explain-runs`), which is what is happening right now. Joining them is a
// rule, not a side-effect, so it lives here as a function over both — testable
// by call-and-assert, and shared by the JSON-RPC reads without either of them
// owning it.

import type { ExplainReport } from './explain-report'
import type { ExplainActivityLine, ExplainPhase, ExplainRunView } from './explain-runs'
import type { ExplainRecord, ExplainTarget } from './explain-store'
import type { RawDiscussion, RawMrDetail } from '../gateways/gitlab/types'

/** One tab, as the client sees it. */
export type ExplainTab = {
  readonly iid: number
  readonly title: string
  readonly webUrl: string
  readonly sourceBranch: string
  readonly targetBranch: string
  /** The commit the report describes. */
  readonly headSha: string
  readonly issueKey: string | null
  readonly phase: ExplainPhase
  /** Non-null while a run is live — the id the SSE channel is keyed by. */
  readonly runId: string | null
  readonly startedAt: string
  readonly generatedAt: string | null
  readonly activity: readonly ExplainActivityLine[]
  readonly report: ExplainReport | null
  readonly error: string | null
  /**
   * The MR's head commit *now*, when GitLab last answered. Different from
   * `headSha` means the author pushed since the report, so the tab warns rather
   * than letting a stale tree be reviewed unknowingly. `null` is "unknown" —
   * GitLab could not be reached — which the tab says rather than guessing.
   */
  readonly currentHeadSha: string | null
}

/**
 * Join the file and the live run into one tab.
 *
 * The live run wins on everything it knows, because it is the present tense.
 * The file's one unique contribution is `generatedAt`, and its one unique
 * *meaning* is this: a pending record with no live run is **interrupted** — the
 * dev server restarted under a run in flight — which is the whole reason the
 * record is written before the report exists.
 */
export function projectExplainTab(input: {
  readonly iid: number
  readonly record: ExplainRecord | null
  readonly run: ExplainRunView | null
  readonly currentHeadSha: string | null
}): ExplainTab | null {
  const { iid, record, run, currentHeadSha } = input
  const target = run?.target ?? record
  if (target === null || target === undefined) return null

  return {
    iid,
    title: target.title,
    webUrl: target.webUrl,
    sourceBranch: target.sourceBranch,
    targetBranch: target.targetBranch,
    headSha: target.headSha,
    issueKey: target.issueKey,
    phase: run?.phase ?? (record?.report === null || record === null ? 'interrupted' : 'report'),
    runId: run?.runId ?? null,
    startedAt: run === null ? (record?.startedAt ?? '') : new Date(run.startedAt).toISOString(),
    generatedAt: record?.generatedAt ?? null,
    activity: run?.activity ?? [],
    // A live run answers for its own report, including with `null`. Falling back
    // to the file during a re-run would pair a report of the *old* commit with
    // the `headSha` of the new one — a tab claiming to describe a tree it does
    // not. The activity log is what the user watches meanwhile.
    report: run === null ? (record?.report ?? null) : run.report,
    error: run?.error ?? null,
    currentHeadSha,
  }
}

/**
 * The MR thread as text, one block per discussion, **system notes filtered out**
 * — GitLab's `/discussions` mixes real comments with "added 3 commits" machine
 * notes, and feeding those to the agent is noise it would have to learn to
 * ignore. A resolved thread is marked rather than dropped: that a concern was
 * raised and settled is review context.
 */
export function discussionsToText(discussions: readonly RawDiscussion[]): string {
  return discussions
    .map((thread) => {
      const notes = thread.notes
        .filter((note) => !note.system && note.body.trim() !== '')
        .map((note) => `${note.authorUsername}: ${note.body.trim()}`)
      if (notes.length === 0) return ''
      const resolved = thread.notes.some((note) => note.resolvable && note.resolved)
      return `${resolved ? '[resolved] ' : ''}${notes.join('\n')}`
    })
    .filter((block) => block !== '')
    .join('\n\n')
}

// Same shape as `assertIssueKey`'s pattern, scanned mid-string — the convention
// `open-workspace.ts` already uses for keys embedded in a name.
const KEY_IN_TITLE = /(?<![A-Za-z0-9])[A-Z][A-Z0-9]+-[1-9]\d*(?![0-9A-Za-z])/u

/**
 * What a tab is a review *of*, read off the MR GitLab just gave us. A pure
 * mapping, so the handler stays a handler.
 */
export function explainTargetFor(
  iid: number,
  detail: RawMrDetail,
  issueKey: string | null,
): ExplainTarget {
  return {
    iid,
    title: detail.title,
    webUrl: detail.webUrl,
    sourceBranch: detail.sourceBranch,
    targetBranch: detail.targetBranch,
    headSha: detail.headSha,
    issueKey,
  }
}

/**
 * The Jira key an MR is about: the one the caller handed us, or the one in the
 * MR title. The fallback is what lets Explain work from a **review card** — an
 * MR someone else wrote, which the board may know nothing else about.
 */
export function explainIssueKeyFor(given: string | null, mrTitle: string): string | null {
  if (given !== null && given !== '') return given
  const match = KEY_IN_TITLE.exec(mrTitle)
  return match === null ? null : match[0]
}
