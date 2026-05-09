import type { SearchIssuesResult } from '~/kernel'

export interface BoardGateway {
  loadBoard(): Promise<SearchIssuesResult>
}

export interface BoardCachePort {
  invalidateBoard(): void
}
