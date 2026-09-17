export class WatchlistUnauthorized {
  readonly _tag = 'WatchlistUnauthorized' as const
}

export class WatchlistNetworkError {
  readonly _tag = 'WatchlistNetworkError' as const
  constructor(readonly message: string) {}
}

export type WatchlistLoadError = WatchlistUnauthorized | WatchlistNetworkError
