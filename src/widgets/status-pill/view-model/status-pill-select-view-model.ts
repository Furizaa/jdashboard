import { match } from 'ts-pattern'
import type { GetTransitionsResult } from '~/kernel'
import { styleForStatus, type StatusStyle } from '../domain/status-color'
import { displayNameForStatus } from '../domain/status-display-name'

export type State = { open: false } | { open: true }

export const initialState: State = { open: false }

export type Event = { type: 'toggle' } | { type: 'close' }

export function reduce(state: State, event: Event): State {
  return match(event)
    .with({ type: 'toggle' }, () => ({ open: !state.open }) as State)
    .with({ type: 'close' }, () => ({ open: false }) as State)
    .exhaustive()
}

export type TransitionItem = {
  id: string
  toStatusName: string
  displayName: string
  style: StatusStyle
  isCurrent: boolean
}

export type DropdownState =
  | { kind: 'loading' }
  | { kind: 'error-network' }
  | { kind: 'error-unauthorized' }
  | { kind: 'no-transitions' }
  | { kind: 'available'; items: readonly TransitionItem[] }

export type DisplayState = { open: false } | { open: true; dropdown: DropdownState }

export type TransitionsView = {
  data: GetTransitionsResult | undefined
  isPending: boolean
  isError: boolean
}

export function derive(
  state: State,
  currentStatus: string,
  transitions: TransitionsView,
): DisplayState {
  if (!state.open) return { open: false }
  if (transitions.isPending) return { open: true, dropdown: { kind: 'loading' } }
  if (transitions.isError || transitions.data === undefined)
    return { open: true, dropdown: { kind: 'error-network' } }
  const data = transitions.data
  if (!data.ok) {
    return {
      open: true,
      dropdown: {
        kind: data.reason === 'unauthorized' ? 'error-unauthorized' : 'error-network',
      },
    }
  }
  if (data.transitions.length === 0) return { open: true, dropdown: { kind: 'no-transitions' } }
  const lower = currentStatus.toLowerCase()
  const items: TransitionItem[] = data.transitions.map((t) => ({
    id: t.id,
    toStatusName: t.toStatusName,
    displayName: displayNameForStatus(t.toStatusName),
    style: styleForStatus(t.toStatusName),
    isCurrent: t.toStatusName.toLowerCase() === lower,
  }))
  return { open: true, dropdown: { kind: 'available', items } }
}
