import { match } from 'ts-pattern'
import type { MrSummary, ReviewCard } from './gitlab'
import type { WorkItem } from './work-item'

// Resolving "the MR for this ticket" was inlined identically in three detail
// views (`OpenMrLink`, `ReviewMrButton`, `OpenInWorkspaceButton`), each with its
// own `findReviewMrIid` / `findReviewMrUrl`. The palette needs a fourth caller,
// and one keyed by a ticket it is handed rather than one it renders — so the
// rule lives here, pure over the two kernel shapes it reads.

/** The handle on an MR: enough to open it, review it, or read its branch. */
export type MrRef = {
  readonly iid: number
  readonly webUrl: string
}

/**
 * The MR for a ticket, if there is one: an MR **we authored** (from the board's
 * MR-status map) or one **we are a reviewer on** (a `review-real` card carrying
 * the same key). Authored wins — it is our own branch, and it is the one the
 * board card already shows.
 *
 * Branch names do not reliably embed the issue key, so the `iid` is the only
 * dependable handle; that is why this returns the ref rather than a URL.
 */
export function resolveMrForKey(input: {
  readonly issueKey: string
  readonly authoredByKey: Readonly<Record<string, MrSummary>> | undefined
  readonly reviewCards: readonly ReviewCard[] | undefined
}): MrRef | null {
  const authored = input.authoredByKey?.[input.issueKey]
  if (authored !== undefined) return { iid: authored.iid, webUrl: authored.webUrl }
  for (const card of input.reviewCards ?? []) {
    if (card.kind === 'review-real' && card.jira.key === input.issueKey) {
      return { iid: card.iid, webUrl: card.webUrl }
    }
  }
  return null
}

/** The two queries MR resolution reads. `undefined` means "has not loaded". */
export type MrSources = {
  readonly authoredByKey: Readonly<Record<string, MrSummary>> | undefined
  readonly reviewCards: readonly ReviewCard[] | undefined
}

/**
 * The MR for a work item. A review card **is** an MR, so it answers for itself —
 * including a `review-fake` card, which has no Jira key to look one up by and
 * would otherwise lose the only two actions it has.
 */
export function resolveMrForWorkItem(item: WorkItem, sources: MrSources): MrRef | null {
  return match(item)
    .with({ kind: 'review-real' }, { kind: 'review-fake' }, (i) => ({
      iid: i.card.iid,
      webUrl: i.card.webUrl,
    }))
    .with({ kind: 'jira' }, { kind: 'watchlist' }, (i) =>
      resolveMrForKey({ issueKey: i.issue.key, ...sources }),
    )
    .exhaustive()
}
