import type { BoardIssue } from './jira'

// Watchlist cards are Jira issues the user advises on. They always render in the
// "In Implementation" lane's watchlist sub-section regardless of real status, so
// there is no column-placement function here (cf. `reviewBucketColumn`). Their id
// is prefixed so it never collides with the same key used as a board jira card.
export const WATCHLIST_CARD_ID_PREFIX = 'watchlist:'

export function watchlistCardId(issue: Pick<BoardIssue, 'key'>): string {
  return `${WATCHLIST_CARD_ID_PREFIX}${issue.key}`
}
