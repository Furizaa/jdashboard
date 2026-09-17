import { match } from 'ts-pattern'
import { DEFAULT_TAG_COLOR_ID } from '~/kernel'

// The tag manager modal owns one piece of non-trivial state: the draft for the
// tag being created (name + chosen colour). Editing an existing tag is handled
// inline per-row with plain local state (rename on blur, recolour on pick) and so
// stays out of this machine. Submitting keeps the chosen colour but clears the
// name, so a burst of tags in the same colour is quick to add.

export type State = {
  readonly open: boolean
  readonly draftName: string
  readonly draftColorId: string
}

export type Event =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'draftNameChanged'; name: string }
  | { type: 'draftColorChanged'; colorId: string }
  | { type: 'draftSubmitted' }

export const initialState: State = {
  open: false,
  draftName: '',
  draftColorId: DEFAULT_TAG_COLOR_ID,
}

export function reduce(state: State, event: Event): State {
  return match(event)
    .with({ type: 'opened' }, () => ({ ...state, open: true }))
    .with({ type: 'closed' }, () => ({ ...initialState }))
    .with({ type: 'draftNameChanged' }, ({ name }) => ({ ...state, draftName: name }))
    .with({ type: 'draftColorChanged' }, ({ colorId }) => ({ ...state, draftColorId: colorId }))
    .with({ type: 'draftSubmitted' }, () => ({ ...state, draftName: '' }))
    .exhaustive()
}

// A draft is submittable only when the name has non-whitespace content.
export function canSubmitDraft(state: State): boolean {
  return state.draftName.trim().length > 0
}
