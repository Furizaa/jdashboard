export class CaptureUnauthorized {
  readonly _tag = 'CaptureUnauthorized' as const
}

export class CaptureRejected {
  readonly _tag = 'CaptureRejected' as const
  constructor(readonly message: string) {}
}

export class CaptureNetworkError {
  readonly _tag = 'CaptureNetworkError' as const
  constructor(readonly message: string) {}
}

export type CaptureSubmitError = CaptureUnauthorized | CaptureRejected | CaptureNetworkError

export class CaptureEpicsUnauthorized {
  readonly _tag = 'CaptureEpicsUnauthorized' as const
}

export class CaptureEpicsNetworkError {
  readonly _tag = 'CaptureEpicsNetworkError' as const
  constructor(readonly message: string) {}
}

export type CaptureLoadEpicsError = CaptureEpicsUnauthorized | CaptureEpicsNetworkError
