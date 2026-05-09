export class BoardUnauthorized {
  readonly _tag = 'BoardUnauthorized' as const
}

export class BoardNetworkError {
  readonly _tag = 'BoardNetworkError' as const
  constructor(readonly message: string) {}
}

export type BoardLoadError = BoardUnauthorized | BoardNetworkError
