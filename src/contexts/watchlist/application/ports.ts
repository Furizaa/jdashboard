import type { GetWatchlistCardsResult, SearchWatchlistCandidatesResult } from '~/kernel'

export interface WatchlistGateway {
  loadCards(): Promise<GetWatchlistCardsResult>
  search(text: string): Promise<SearchWatchlistCandidatesResult>
}

export interface WatchlistCachePort {
  invalidateWatchlist(): void
}
