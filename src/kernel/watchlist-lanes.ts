// The Watchlist Board's lane configuration wire types are owned by the
// server-function module and re-exported here so the client refers to them
// through the kernel, never `~/server/...` directly (mirrors `tags.ts`).
export type {
  GetWatchlistLanesResult,
  SetWatchlistLanesResult,
} from '~/server/server-functions/watchlist-lanes'
export type { WatchlistLaneConfig, WatchlistLanesState } from '~/server/lib/watchlist-lanes-store'
