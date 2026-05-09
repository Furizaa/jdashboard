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

function buildItems(
  data: Extract<GetTransitionsResult, { ok: true }>,
  currentStatus: string,
): readonly TransitionItem[] {
  const lower = currentStatus.toLowerCase()
  return data.transitions.map((t) => ({
    id: t.id,
    toStatusName: t.toStatusName,
    displayName: displayNameForStatus(t.toStatusName),
    style: styleForStatus(t.toStatusName),
    isCurrent: t.toStatusName.toLowerCase() === lower,
  }))
}

function dropdownFromOk(
  data: Extract<GetTransitionsResult, { ok: true }>,
  currentStatus: string,
): DropdownState {
  if (data.transitions.length === 0) return { kind: 'no-transitions' }
  return { kind: 'available', items: buildItems(data, currentStatus) }
}

function dropdownFromErr(data: Extract<GetTransitionsResult, { ok: false }>): DropdownState {
  // oxlint-disable-next-line no-underscore-dangle -- `_tag` is the standard discriminator on Effect Schema tagged errors
  return { kind: data.error._tag === 'Unauthorized' ? 'error-unauthorized' : 'error-network' }
}

function deriveDropdown(currentStatus: string, transitions: TransitionsView): DropdownState {
  if (transitions.isPending) return { kind: 'loading' }
  const data = transitions.data
  if (transitions.isError || data === undefined) return { kind: 'error-network' }
  return data.ok ? dropdownFromOk(data, currentStatus) : dropdownFromErr(data)
}

export function derive(
  state: State,
  currentStatus: string,
  transitions: TransitionsView,
): DisplayState {
  if (!state.open) return { open: false }
  return { open: true, dropdown: deriveDropdown(currentStatus, transitions) }
}
