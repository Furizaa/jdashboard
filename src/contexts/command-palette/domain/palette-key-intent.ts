import { ACTION_FOR_SHORTCUT, type ActionKind } from '~/kernel'

/**
 * Keyboard intents, mirroring the shape of
 * `contexts/detail/domain/panel-key-intent.ts`. Pure over the event — no DOM
 * reads, no side effects, so the whole key map is unit-testable.
 */
export type PaletteIntent =
  | { readonly kind: 'next' }
  | { readonly kind: 'prev' }
  | { readonly kind: 'enter' }
  | { readonly kind: 'back' }
  | { readonly kind: 'close' }
  // Only ever produced at a `list` level, where there is no query field for a
  // letter to type into. That is the whole reason the action list has no text
  // filter: one keypress runs one action.
  | { readonly kind: 'action'; readonly action: ActionKind }

/**
 * Which kind of level the keypress arrived at, which changes what a bare letter
 * means:
 *
 * - `root` owns the query field, so `j` there types a `j` and arrows are the
 *   only way to move. (`j`/`k` are reserved for list navigation everywhere —
 *   but only where there is no text input to steal them from.)
 * - `list` is a list and nothing else — the per-item action list and its
 *   sub-lists — so `j`/`k` navigate and `Backspace` pops a level.
 */
export type PaletteLevel = 'root' | 'list'

const SHARED: Readonly<Record<string, PaletteIntent>> = {
  ArrowDown: { kind: 'next' },
  ArrowUp: { kind: 'prev' },
  Enter: { kind: 'enter' },
  Escape: { kind: 'close' },
}

const LIST_ONLY: Readonly<Record<string, PaletteIntent>> = {
  j: { kind: 'next' },
  k: { kind: 'prev' },
  // Backspace has nothing to delete in a list-only level, so it is free to mean
  // "up one level" — the same gesture as ←, and what Raycast trains.
  backspace: { kind: 'back' },
  arrowleft: { kind: 'back' },
}

export function paletteKeyIntent(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>,
  level: PaletteLevel,
): PaletteIntent | null {
  // A modified keypress is never a palette intent — ⌘K is handled separately as
  // the global hotkey, and ⌘← / ⌥← belong to the browser and the caret.
  if (event.metaKey || event.ctrlKey || event.altKey) return null

  const shared = SHARED[event.key]
  if (shared !== undefined) return shared
  if (level === 'root') return null

  const lower = event.key.toLowerCase()
  // List navigation wins over the shortcut map. It can only ever shadow `j`/`k`,
  // which `ACTION_SHORTCUTS` is asserted never to claim.
  const listOnly = LIST_ONLY[lower]
  if (listOnly !== undefined) return listOnly

  const action = ACTION_FOR_SHORTCUT[lower]
  return action === undefined ? null : { kind: 'action', action }
}

/** ⌘K / Ctrl-K: the global open-and-close hotkey. */
export function isPaletteHotkey(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
}

/**
 * Whether an element is somewhere the user is typing. ⌘K must not yank focus out
 * of the note editor or the quick-create form mid-sentence — the guard the
 * deleted header search box already had, kept verbatim.
 */
export function isTextEntryElement(element: Element | null): boolean {
  if (element === null) return false
  if (element instanceof HTMLInputElement) return true
  if (element instanceof HTMLTextAreaElement) return true
  return element instanceof HTMLElement && element.isContentEditable
}
