export class DetailUnauthorized {
  readonly _tag = 'DetailUnauthorized' as const
}

export class DetailNotFound {
  readonly _tag = 'DetailNotFound' as const
}

export class DetailNetworkError {
  readonly _tag = 'DetailNetworkError' as const
  constructor(readonly message: string) {}
}

export type DetailLoadError = DetailUnauthorized | DetailNotFound | DetailNetworkError
