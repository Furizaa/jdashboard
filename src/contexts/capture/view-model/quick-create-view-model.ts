import { match } from 'ts-pattern'

export type State =
  | { phase: 'closed' }
  | { phase: 'open-idle' }
  | { phase: 'open-pending' }
  | { phase: 'open-error'; message: string }

export type Event =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'formSubmitted' }
  | { type: 'submitResolved' }
  | { type: 'submitRejected'; message: string }
  | { type: 'timedOut' }

export const TIMEOUT_MESSAGE = 'Request timed out'

export const initialState: State = { phase: 'closed' }

export function reduce(state: State, event: Event): State {
  return match(event)
    .with({ type: 'opened' }, () =>
      match(state)
        .with({ phase: 'closed' }, () => ({ phase: 'open-idle' as const }))
        .otherwise(() => state),
    )
    .with({ type: 'closed' }, () =>
      match(state)
        .with({ phase: 'closed' }, () => state)
        .with({ phase: 'open-pending' }, () => state)
        .with({ phase: 'open-idle' }, () => ({ phase: 'closed' as const }))
        .with({ phase: 'open-error' }, () => ({ phase: 'closed' as const }))
        .exhaustive(),
    )
    .with({ type: 'formSubmitted' }, () =>
      match(state)
        .with({ phase: 'open-idle' }, () => ({ phase: 'open-pending' as const }))
        .with({ phase: 'open-error' }, () => ({ phase: 'open-pending' as const }))
        .otherwise(() => state),
    )
    .with({ type: 'submitResolved' }, () =>
      match(state)
        .with({ phase: 'open-pending' }, () => ({ phase: 'closed' as const }))
        .otherwise(() => state),
    )
    .with({ type: 'submitRejected' }, ({ message }) =>
      match(state)
        .with({ phase: 'open-pending' }, () => ({ phase: 'open-error' as const, message }))
        .otherwise(() => state),
    )
    .with({ type: 'timedOut' }, () =>
      match(state)
        .with({ phase: 'open-pending' }, () => ({
          phase: 'open-error' as const,
          message: TIMEOUT_MESSAGE,
        }))
        .otherwise(() => state),
    )
    .exhaustive()
}

export function isOpen(state: State): boolean {
  return state.phase !== 'closed'
}

export function isPending(state: State): boolean {
  return state.phase === 'open-pending'
}
