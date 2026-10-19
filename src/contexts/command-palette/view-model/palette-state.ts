import { match } from 'ts-pattern'
import type { SubListKind } from '../domain'

// Framework-free state machine for the palette. The status *is* the navigation
// level, and each deeper level carries the shallower one's fields — so backing
// out of a level restoring the query and the selected result is structural
// rather than something the reducer has to remember.
export type PaletteState =
  | { readonly status: 'closed' }
  | { readonly status: 'open'; readonly query: string; readonly selected: number }
  | {
      readonly status: 'actions'
      readonly query: string
      readonly selected: number
      /**
       * Which item's actions — by `workItemId`, not by index, so a board refresh
       * that reorders the list cannot silently retarget the action.
       */
      readonly itemId: string
      readonly actionIndex: number
    }
  | {
      readonly status: 'sub-list'
      readonly query: string
      readonly selected: number
      /**
       * Which level opened this list, and therefore which one `wentBack` returns
       * to. An item's action list carries the fields that level held; a command
       * carries none, because the root level's own fields are already here.
       *
       * The union is what lets `charts` reuse this level at all: the list of
       * charts belongs to no work item (ADR-0012), and widening `itemId` to a
       * sentinel would have been the lie this type exists to avoid.
       */
      readonly owner: SubListOwner
      readonly subList: SubListKind
      readonly subIndex: number
    }
  // The generated shortcut reference. It sits beside `open` rather than under
  // it: it belongs to no work item, and backing out returns to the results.
  | {
      readonly status: 'help'
      readonly query: string
      readonly selected: number
    }

export type SubListOwner =
  | { readonly kind: 'item'; readonly itemId: string; readonly actionIndex: number }
  | { readonly kind: 'command' }

export type PaletteEvent =
  | { readonly type: 'opened' }
  | { readonly type: 'closed' }
  | { readonly type: 'queryChanged'; readonly query: string }
  | { readonly type: 'moved'; readonly delta: number; readonly count: number }
  | { readonly type: 'highlighted'; readonly index: number }
  | { readonly type: 'enteredActions'; readonly itemId: string }
  | { readonly type: 'enteredSubList'; readonly subList: SubListKind }
  | { readonly type: 'enteredHelp' }
  | { readonly type: 'wentBack' }

export const initialPaletteState: PaletteState = { status: 'closed' }

// Wrap rather than clamp: a list you can run off the end of feels broken when
// the whole point is never touching the mouse.
function wrap(index: number, count: number): number {
  if (count <= 0) return 0
  return ((index % count) + count) % count
}

// One reducer per level, dispatched on the level. Splitting it this way keeps
// each level's rules readable in one screen, and the outer `exhaustive()` means
// adding a level is a compile error until it has rules of its own.
//
// Two rules hold across every level and are worth reading together:
//   - `closed` resets to the top from any depth — Escape does not care where
//     you are.
//   - `wentBack` pops exactly one level, carrying everything the shallower
//     level held. Conflating the two would mean losing your query because you
//     backed out of a status list.

type ClosedState = Extract<PaletteState, { status: 'closed' }>
type OpenState = Extract<PaletteState, { status: 'open' }>
type ActionsState = Extract<PaletteState, { status: 'actions' }>
type SubListState = Extract<PaletteState, { status: 'sub-list' }>
type HelpState = Extract<PaletteState, { status: 'help' }>

function reduceClosed(state: ClosedState, event: PaletteEvent): PaletteState {
  return match(event)
    .with({ type: 'opened' }, (): PaletteState => ({ status: 'open', query: '', selected: 0 }))
    .otherwise(() => state)
}

function reduceOpen(state: OpenState, event: PaletteEvent): PaletteState {
  return (
    match(event)
      .with({ type: 'closed' }, () => initialPaletteState)
      // A fresh query means a fresh list, so the highlight goes back to the top.
      .with(
        { type: 'queryChanged' },
        (e): PaletteState => ({ status: 'open', query: e.query, selected: 0 }),
      )
      .with({ type: 'moved' }, (e) => ({
        ...state,
        selected: wrap(state.selected + e.delta, e.count),
      }))
      .with({ type: 'highlighted' }, (e) => ({ ...state, selected: Math.max(0, e.index) }))
      .with(
        { type: 'enteredActions' },
        (e): PaletteState => ({
          status: 'actions',
          query: state.query,
          selected: state.selected,
          itemId: e.itemId,
          actionIndex: 0,
        }),
      )
      .with(
        { type: 'enteredHelp' },
        (): PaletteState => ({ status: 'help', query: state.query, selected: state.selected }),
      )
      // A command can open a nested list straight from the root, skipping the
      // action level entirely — `Open Gantt chart…` is the one that does.
      .with(
        { type: 'enteredSubList' },
        (e): PaletteState => ({
          status: 'sub-list',
          query: state.query,
          selected: state.selected,
          owner: { kind: 'command' },
          subList: e.subList,
          subIndex: 0,
        }),
      )
      // Root has no level above it, so `wentBack` here is a no-op — the key map
      // does not even produce it, and this is the belt to those braces.
      .otherwise(() => state)
  )
}

function reduceHelp(state: HelpState, event: PaletteEvent): PaletteState {
  return match(event)
    .with({ type: 'closed' }, () => initialPaletteState)
    .with(
      { type: 'wentBack' },
      (): PaletteState => ({ status: 'open', query: state.query, selected: state.selected }),
    )
    .otherwise(() => state)
}

function reduceActions(state: ActionsState, event: PaletteEvent): PaletteState {
  return match(event)
    .with({ type: 'closed' }, () => initialPaletteState)
    .with({ type: 'moved' }, (e) => ({
      ...state,
      actionIndex: wrap(state.actionIndex + e.delta, e.count),
    }))
    .with({ type: 'highlighted' }, (e) => ({ ...state, actionIndex: Math.max(0, e.index) }))
    .with(
      { type: 'enteredSubList' },
      (e): PaletteState => ({
        status: 'sub-list',
        query: state.query,
        selected: state.selected,
        owner: { kind: 'item', itemId: state.itemId, actionIndex: state.actionIndex },
        subList: e.subList,
        subIndex: 0,
      }),
    )
    .with(
      { type: 'wentBack' },
      (): PaletteState => ({
        status: 'open',
        query: state.query,
        selected: state.selected,
      }),
    )
    .otherwise(() => state)
}

function reduceSubList(state: SubListState, event: PaletteEvent): PaletteState {
  return (
    match(event)
      .with({ type: 'closed' }, () => initialPaletteState)
      .with({ type: 'moved' }, (e) => ({
        ...state,
        subIndex: wrap(state.subIndex + e.delta, e.count),
      }))
      .with({ type: 'highlighted' }, (e) => ({ ...state, subIndex: Math.max(0, e.index) }))
      // Back to whichever level opened the list — the action list for an item's,
      // the results for a command's. Conflating the two would strand the reader on
      // an action list for a ticket they never chose.
      .with({ type: 'wentBack' }, (): PaletteState => {
        const { owner } = state
        return owner.kind === 'command'
          ? { status: 'open', query: state.query, selected: state.selected }
          : {
              status: 'actions',
              query: state.query,
              selected: state.selected,
              itemId: owner.itemId,
              actionIndex: owner.actionIndex,
            }
      })
      .otherwise(() => state)
  )
}

export function reducePalette(state: PaletteState, event: PaletteEvent): PaletteState {
  // Events that do not apply to the current level are dropped, not errors: a
  // keypress can always race a close.
  return match(state)
    .with({ status: 'closed' }, (s) => reduceClosed(s, event))
    .with({ status: 'open' }, (s) => reduceOpen(s, event))
    .with({ status: 'actions' }, (s) => reduceActions(s, event))
    .with({ status: 'sub-list' }, (s) => reduceSubList(s, event))
    .with({ status: 'help' }, (s) => reduceHelp(s, event))
    .exhaustive()
}

/** The query at any level — `''` while closed. */
export function paletteQuery(state: PaletteState): string {
  return match(state)
    .with({ status: 'closed' }, () => '')
    .with(
      { status: 'open' },
      { status: 'actions' },
      { status: 'sub-list' },
      { status: 'help' },
      (s) => s.query,
    )
    .exhaustive()
}

/**
 * Which item, if any, the palette is currently pointed at. The host watches this
 * to fetch that ticket's transitions — on entering the item, not per search
 * result, so typing never fans out a request per row.
 */
export function paletteActiveItemId(state: PaletteState): string | null {
  return (
    match(state)
      .with({ status: 'closed' }, { status: 'open' }, { status: 'help' }, () => null)
      .with({ status: 'actions' }, (s) => s.itemId)
      // A command-owned list points at no ticket, so there is nothing for the host
      // to fetch transitions for — which is the whole reason this returns `null`
      // rather than the last item visited.
      .with({ status: 'sub-list' }, (s) => (s.owner.kind === 'item' ? s.owner.itemId : null))
      .exhaustive()
  )
}
