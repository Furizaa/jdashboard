export class TransitionRejected {
  readonly _tag = 'TransitionRejected' as const
  constructor(readonly message: string) {}
}

export class TransitionUnauthorized {
  readonly _tag = 'TransitionUnauthorized' as const
  constructor(readonly message: string) {}
}

export class TransitionNetworkError {
  readonly _tag = 'TransitionNetworkError' as const
  constructor(readonly message: string) {}
}

export type ApplyTransitionError =
  | TransitionRejected
  | TransitionUnauthorized
  | TransitionNetworkError

export class CreateIssueRejected {
  readonly _tag = 'CreateIssueRejected' as const
  constructor(readonly message: string) {}
}

export class CreateIssueUnauthorized {
  readonly _tag = 'CreateIssueUnauthorized' as const
  constructor(readonly message: string) {}
}

export class CreateIssueTimeout {
  readonly _tag = 'CreateIssueTimeout' as const
}

export class CreateIssueNetworkError {
  readonly _tag = 'CreateIssueNetworkError' as const
  constructor(readonly message: string) {}
}

export type CreateIssueError =
  | CreateIssueRejected
  | CreateIssueUnauthorized
  | CreateIssueTimeout
  | CreateIssueNetworkError

export class MrMergedTransitionsFailed {
  readonly _tag = 'MrMergedTransitionsFailed' as const
  constructor(readonly message: string) {}
}

export class MrMergedNoDirectTransition {
  readonly _tag = 'MrMergedNoDirectTransition' as const
  constructor(
    readonly key: string,
    readonly targetStatusName: string,
  ) {}
}

export class MrMergedTransitionRejected {
  readonly _tag = 'MrMergedTransitionRejected' as const
  constructor(readonly cause: ApplyTransitionError) {}
}

export type HandleMrMergedError =
  | MrMergedTransitionsFailed
  | MrMergedNoDirectTransition
  | MrMergedTransitionRejected
