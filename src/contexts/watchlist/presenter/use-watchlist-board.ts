import { useTagsState } from '~/coordinator'
import { usePolling } from '~/lib/use-polling'
import { derive, type WatchlistBoardDisplay } from '../view-model/watchlist-board-view-model'
import { useWatchlistCards } from './use-watchlist-cards'
import { useWatchlistLanes } from './use-watchlist-lanes'

// Refetch cadence mirrors the main board: a watchlist ticket's status/summary can
// change upstream, and the board should reflect it without a manual refresh.
export const WATCHLIST_BOARD_POLL_INTERVAL_MS = 60_000

export function useWatchlistBoard(searchQuery: string): WatchlistBoardDisplay {
  const cardsQuery = useWatchlistCards()
  const tagsQuery = useTagsState()
  const lanesQuery = useWatchlistLanes()

  usePolling(() => {
    cardsQuery.refetch()
  }, WATCHLIST_BOARD_POLL_INTERVAL_MS)

  return derive({
    queryData: {
      data: cardsQuery.data,
      isPending: cardsQuery.isPending,
      isError: cardsQuery.isError,
      error: cardsQuery.error instanceof Error ? cardsQuery.error : undefined,
    },
    tagsState: tagsQuery.data,
    lanes: lanesQuery.data?.lanes,
    searchQuery,
  })
}
