import { match, P } from 'ts-pattern'
import type { GetWatchlistCardsResult, TagsState, WatchlistLaneConfig } from '~/kernel'
import { assembleLanes, type WatchlistLane } from '../domain/assemble-lanes'

// Framework-free derivation for the Watchlist Board. Unlike the main board this
// view-model has no change-indication reducer — the watchlist board renders its
// tag-lanes statically (no enter/leave animation), so a pure `derive` over the
// three inputs (cards, tags, lane config) is the whole state machine.

export type WatchlistBoardDisplay =
  | { phase: 'loading' }
  | { phase: 'error-hard'; message: string }
  | { phase: 'unauthorized' }
  | { phase: 'no-lanes' }
  | { phase: 'ready'; baseUrl: string; lanes: readonly WatchlistLane[] }

export type WatchlistBoardQueryData = {
  data: GetWatchlistCardsResult | undefined
  isPending: boolean
  isError: boolean
  error: Error | undefined
}

// `no-lanes` fires when the configuration resolves to zero *live* lanes — either
// nothing is configured yet, or every configured tag was deleted. Both cases send
// the user to the lane-config modal, so they collapse to one phase.
export function derive(input: {
  queryData: WatchlistBoardQueryData
  tagsState: TagsState | undefined
  lanes: readonly WatchlistLaneConfig[] | undefined
  searchQuery: string
}): WatchlistBoardDisplay {
  const { queryData, tagsState, lanes: laneConfig, searchQuery } = input

  if (queryData.isPending) return { phase: 'loading' }
  if (queryData.isError && queryData.data === undefined) {
    const message = queryData.error?.message ?? 'unknown error'
    return { phase: 'error-hard', message: `Couldn't load watchlist: ${message}` }
  }
  return match(queryData.data)
    .with(P.nullish, () => ({ phase: 'unauthorized' as const }))
    .with({ ok: false }, () => ({ phase: 'unauthorized' as const }))
    .with({ ok: true }, (data) => {
      // Local tag/lane state still hydrating — keep showing the skeleton rather
      // than flashing an empty board.
      if (tagsState === undefined || laneConfig === undefined) return { phase: 'loading' as const }
      const lanes = assembleLanes({ cards: data.cards, tagsState, lanes: laneConfig, searchQuery })
      if (lanes.length === 0) return { phase: 'no-lanes' as const }
      return { phase: 'ready' as const, baseUrl: data.baseUrl, lanes }
    })
    .exhaustive()
}
