import { match } from 'ts-pattern'
import type { ReviewCardFake, ReviewCardReal } from './gitlab'
import type { BoardIssue } from './jira'
import { reviewCardId, reviewSearchHaystack } from './review'
import { watchlistCardId } from './watchlist'

// A `WorkItem` is the unified handle on anything the command palette can find,
// across all three sources it searches: assigned board issues, watchlist cards,
// and GitLab review cards. Board and Review already share `Column` as kernel
// terminology; the palette searches all three at once, which is what finally
// earns this type a place in the kernel rather than at an assembly layer.
//
// The discriminant mirrors `cardKind` in `~/lib/testids` so a palette row and a
// board card describe the same thing with the same word.
export type WorkItem =
  | { readonly kind: 'jira'; readonly issue: BoardIssue }
  | { readonly kind: 'watchlist'; readonly issue: BoardIssue }
  | { readonly kind: 'review-real'; readonly card: ReviewCardReal }
  | { readonly kind: 'review-fake'; readonly card: ReviewCardFake }

/**
 * Stable identity, reusing each source's existing id scheme rather than
 * inventing a second one (`reviewCardId` for review cards, the bare key for a
 * board issue, the prefixed key for a watchlist card).
 */
export function workItemId(item: WorkItem): string {
  return match(item)
    .with({ kind: 'jira' }, (i) => i.issue.key)
    .with({ kind: 'watchlist' }, (i) => watchlistCardId(i.issue))
    .with({ kind: 'review-real' }, { kind: 'review-fake' }, (i) => reviewCardId(i.card))
    .exhaustive()
}

/**
 * The Jira ticket behind this item, or `null` when there is none. This single
 * predicate gates almost every action's legality: a `review-fake` card is an MR
 * with no resolvable Jira key, so there is no ticket to transition, tag, or note.
 */
export function workItemJiraKey(item: WorkItem): string | null {
  return match(item)
    .with({ kind: 'jira' }, { kind: 'watchlist' }, (i) => i.issue.key)
    .with({ kind: 'review-real' }, (i) => i.card.jira.key)
    .with({ kind: 'review-fake' }, () => null)
    .exhaustive()
}

/** The item's human title — the ticket summary, or the MR title for a fake card. */
export function workItemTitle(item: WorkItem): string {
  return match(item)
    .with({ kind: 'jira' }, { kind: 'watchlist' }, (i) => i.issue.summary)
    .with({ kind: 'review-real' }, (i) => i.card.jira.summary)
    .with({ kind: 'review-fake' }, (i) => i.card.title)
    .exhaustive()
}

/**
 * Lowercased search text. Jira-backed items reuse the `` `${key} ${summary}` ``
 * shape `filterIssues` already searches; review cards delegate to
 * `reviewSearchHaystack` so the `` `MR !${iid} ${title}` `` form lives in one place.
 */
export function workItemHaystack(item: WorkItem): string {
  return match(item)
    .with({ kind: 'jira' }, { kind: 'watchlist' }, (i) =>
      `${i.issue.key} ${i.issue.summary}`.toLowerCase(),
    )
    .with({ kind: 'review-real' }, { kind: 'review-fake' }, (i) => reviewSearchHaystack(i.card))
    .exhaustive()
}

// Which source survives when the same ticket arrives from more than one: the one
// carrying the most actionable state.
//
//   jira > watchlist > review-real > review-fake
//
// `jira` beats `watchlist` because an assigned ticket is own work — its status
// pill transitions, where a watchlist card's is advisory and display-only. Both
// beat `review-real`, whose `ReviewCardJira` is a strict subset of `BoardIssue`
// (no `statusName`, so a transition list could not even be placed). `review-fake`
// is last and can never collide by key anyway — it has none.
//
// Nothing is lost by dropping a `review-real` duplicate: the palette resolves an
// item's MR by scanning the review cards for its key, not from the surviving
// item's own shape.
const SOURCE_PRECEDENCE: Record<WorkItem['kind'], number> = {
  jira: 0,
  watchlist: 1,
  'review-real': 2,
  'review-fake': 3,
}

/**
 * Collapse items that describe the same ticket — an assigned ticket that is also
 * on the watchlist, or a `review-real` card whose `jira.key` matches an assigned
 * issue. Grouped by Jira key when there is one, else by `workItemId`; the
 * survivor is chosen by `SOURCE_PRECEDENCE`, ties going to the earlier item.
 */
export function dedupeWorkItems(items: readonly WorkItem[]): readonly WorkItem[] {
  const winners = new Map<string, WorkItem>()
  for (const item of items) {
    const id = workItemJiraKey(item) ?? workItemId(item)
    const held = winners.get(id)
    if (held === undefined || SOURCE_PRECEDENCE[item.kind] < SOURCE_PRECEDENCE[held.kind]) {
      winners.set(id, item)
    }
  }
  return [...winners.values()]
}
