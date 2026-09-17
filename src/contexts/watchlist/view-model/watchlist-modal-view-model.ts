import { match } from 'ts-pattern'

// The add-modal's state machine. Search results are transient query data held by
// the presenter, not modelled here — this machine only guards the open lifecycle
// and the "adding a pick" phase (which blocks closing mid-write, like quick-create).
export type State =
  | { phase: 'closed' }
  | { phase: 'open-idle' }
  | { phase: 'open-adding' }
  | { phase: 'open-error'; message: string }

export type Event =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'addStarted' }
  | { type: 'addResolved' }
  | { type: 'addRejected'; message: string }

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
        .with({ phase: 'open-adding' }, () => state)
        .with({ phase: 'open-idle' }, () => ({ phase: 'closed' as const }))
        .with({ phase: 'open-error' }, () => ({ phase: 'closed' as const }))
        .exhaustive(),
    )
    .with({ type: 'addStarted' }, () =>
      match(state)
        .with({ phase: 'open-idle' }, () => ({ phase: 'open-adding' as const }))
        .with({ phase: 'open-error' }, () => ({ phase: 'open-adding' as const }))
        .otherwise(() => state),
    )
    .with({ type: 'addResolved' }, () =>
      match(state)
        .with({ phase: 'open-adding' }, () => ({ phase: 'closed' as const }))
        .otherwise(() => state),
    )
    .with({ type: 'addRejected' }, ({ message }) =>
      match(state)
        .with({ phase: 'open-adding' }, () => ({ phase: 'open-error' as const, message }))
        .otherwise(() => state),
    )
    .exhaustive()
}

export function isOpen(state: State): boolean {
  return state.phase !== 'closed'
}

export function isAdding(state: State): boolean {
  return state.phase === 'open-adding'
}

export function errorMessage(state: State): string | null {
  return state.phase === 'open-error' ? state.message : null
}
