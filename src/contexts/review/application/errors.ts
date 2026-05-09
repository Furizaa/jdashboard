export class ReviewUnauthorized {
  readonly _tag = 'ReviewUnauthorized' as const
}

export class ReviewNetworkError {
  readonly _tag = 'ReviewNetworkError' as const
  constructor(readonly message: string) {}
}

export type ReviewLoadError = ReviewUnauthorized | ReviewNetworkError
