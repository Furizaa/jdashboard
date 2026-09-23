import type { UseQueryResult } from '@tanstack/react-query'
import { useBoardData, useReviewCards, useWatchlistCards } from '~/coordinator'
import { dedupeWorkItems, type WorkItem } from '~/kernel'
import type { PaletteSourceNote } from '~/contexts/command-palette'

// The cross-context read: Board + Watchlist + Review unified into `WorkItem[]`.
// This lives in `routes/` because `routes/` is the only place multiple contexts
// compose (ADR-0007), which is exactly what lets the palette context itself stay
// ignorant of all three (ADR-0008).

export type PaletteItems = {
  readonly items: readonly WorkItem[]
  readonly sources: readonly PaletteSourceNote[]
}

/**
 * Each source's contribution is read independently and whatever has arrived is
 * returned — a slow GitLab call must not stop you finding an assigned ticket.
 * What is missing is reported rather than silently omitted.
 *
 * `ok: false` (an error envelope, e.g. GitLab 401) is `unavailable`, not
 * `loading`: the request finished and the answer is that there is no answer.
 */
function noteFor<T extends { ok: boolean }>(
  source: string,
  query: UseQueryResult<T>,
): PaletteSourceNote | null {
  if (query.isError) return { source, state: 'unavailable' }
  if (query.data === undefined) return { source, state: 'loading' }
  if (!query.data.ok) return { source, state: 'unavailable' }
  return null
}

export function usePaletteItems(): PaletteItems {
  const board = useBoardData()
  const watchlist = useWatchlistCards()
  const review = useReviewCards()

  const boardIssues = board.data?.ok === true ? board.data.issues : []
  const watchlistCards = watchlist.data?.ok === true ? watchlist.data.cards : []
  const reviewCards = review.data?.ok === true ? review.data.cards : []

  const items: readonly WorkItem[] = [
    ...boardIssues.map((issue): WorkItem => ({ kind: 'jira', issue })),
    ...watchlistCards.map((issue): WorkItem => ({ kind: 'watchlist', issue })),
    ...reviewCards.map(
      (card): WorkItem =>
        card.kind === 'review-real' ? { kind: 'review-real', card } : { kind: 'review-fake', card },
    ),
  ]

  const sources = [
    noteFor('Assigned tickets', board),
    noteFor('Watchlist', watchlist),
    noteFor('Review cards', review),
  ].filter((note): note is PaletteSourceNote => note !== null)

  // Deduped here, not per source: a ticket can be assigned *and* watchlisted,
  // and a real review card carries a Jira key that may match an assigned issue.
  return { items: dedupeWorkItems(items), sources }
}
