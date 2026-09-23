import { useCallback, useEffect, useReducer, useRef } from 'react'
import { match } from 'ts-pattern'
import { workItemId, type WorkItem } from '~/kernel'
import {
  isPaletteHotkey,
  isTextEntryElement,
  paletteKeyIntent,
  type PaletteAction,
  type PaletteCommandSource,
  type PaletteIntent,
  type PaletteLevel,
  type PaletteSourceNote,
  type PaletteSubListSource,
} from '../domain'
import {
  derivePalette,
  initialPaletteState,
  paletteActiveItemId,
  paletteQuery,
  reducePalette,
  type PaletteActionRow,
  type PaletteDisplay,
  type PaletteEvent,
  type PaletteRow,
  type PaletteSubItemRow,
} from '../view-model'

export type CommandPaletteDeps = {
  /** Every work item the palette can find, already deduped, from every source. */
  readonly items: readonly WorkItem[]
  /** Sources not contributing yet, surfaced in the footer. */
  readonly sources: readonly PaletteSourceNote[]
  readonly commands: PaletteCommandSource
  /** The legal actions for one item — the cross-context assembly, injected. */
  readonly actionsFor: (item: WorkItem) => readonly PaletteAction[]
  readonly subListFor: PaletteSubListSource
  /**
   * Fired when the palette points at a work item, and again with `null` when it
   * stops. The host uses it to fetch that ticket's transitions — on entering the
   * item, never per search result, so typing cannot fan out a request per row.
   */
  readonly onActiveItemChange: (item: WorkItem | null) => void
}

export type CommandPaletteApi = {
  readonly display: PaletteDisplay
  readonly setQuery: (query: string) => void
  readonly close: () => void
  readonly back: () => void
  readonly highlight: (index: number) => void
  readonly choose: (row: PaletteRow) => void
  readonly runAction: (row: PaletteActionRow) => void
  readonly runSubItem: (row: PaletteSubItemRow) => void
  readonly onKeyDown: (event: React.KeyboardEvent) => void
}

const LEVEL_FOR_STATUS: Record<Exclude<PaletteDisplay['status'], 'closed'>, PaletteLevel> = {
  root: 'root',
  actions: 'actions',
  'sub-list': 'sub-list',
  help: 'help',
}

/**
 * ⌘K toggles from anywhere. Opening never yanks focus out of another text input
 * mid-sentence — the guard inherited from the deleted header search box. Closing
 * ignores that guard, since the input it would be stealing from is the palette's
 * own query field.
 */
function usePaletteHotkey(isOpen: boolean, dispatch: (event: PaletteEvent) => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteHotkey(event)) return
      if (isOpen) {
        event.preventDefault()
        dispatch({ type: 'closed' })
        return
      }
      if (isTextEntryElement(document.activeElement)) return
      event.preventDefault()
      dispatch({ type: 'opened' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, dispatch])
}

/**
 * Tell the host which item the palette points at, so it can fetch that ticket's
 * transitions — on entering the item, never per search result.
 *
 * Keyed on the id rather than the item object: a query refetch that returns an
 * equal-but-new array must not re-announce the same item.
 */
function useAnnounceActiveItem(
  activeItemId: string | null,
  items: readonly WorkItem[],
  onActiveItemChange: (item: WorkItem | null) => void,
): void {
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => {
    onActiveItemChange(
      activeItemId === null
        ? null
        : (itemsRef.current.find((candidate) => workItemId(candidate) === activeItemId) ?? null),
    )
  }, [activeItemId, onActiveItemChange])
}

/**
 * The only React-bound module in the palette: the global ⌘K listener, focus
 * handoff to the query field, and the reducer binding. Every decision it makes
 * is made by `palette-key-intent` and `palette-view-model`, which are plain
 * functions with no React import.
 */
export function useCommandPalette(deps: CommandPaletteDeps): CommandPaletteApi {
  const [state, dispatch] = useReducer(reducePalette, initialPaletteState)
  usePaletteHotkey(state.status !== 'closed', dispatch)
  useAnnounceActiveItem(paletteActiveItemId(state), deps.items, deps.onActiveItemChange)

  const display = derivePalette(state, {
    items: deps.items,
    commands: deps.commands(paletteQuery(state)),
    actionsFor: deps.actionsFor,
    subListFor: deps.subListFor,
    sources: deps.sources,
  })

  const close = useCallback(() => dispatch({ type: 'closed' }), [])
  const back = useCallback(() => dispatch({ type: 'wentBack' }), [])

  const choose = useCallback((row: PaletteRow) => {
    match(row.target)
      // Entering an item's action list keeps the palette open and keeps the
      // query — the results list is still there to come back to.
      .with({ kind: 'item' }, ({ item }) => {
        dispatch({ type: 'enteredActions', itemId: workItemId(item) })
      })
      .with({ kind: 'command' }, ({ command }) => {
        if (!command.enabled) return
        dispatch({ type: 'closed' })
        command.run()
      })
      .exhaustive()
  }, [])

  const runAction = useCallback((row: PaletteActionRow) => {
    if (!row.enabled) return
    match(row.perform)
      .with({ effect: 'sub-list' }, ({ subList }) => {
        dispatch({ type: 'enteredSubList', subList })
      })
      .with({ effect: 'run' }, ({ run }) => {
        // The palette closes on a successful action; where an action's own UI
        // takes over instead, that is the action's business — `run` is a closure
        // the assembly built, and the assembly knows which of its actions do that.
        dispatch({ type: 'closed' })
        run()
      })
      .exhaustive()
  }, [])

  const staysOpen = display.status === 'sub-list' && display.staysOpen
  const runSubItem = useCallback(
    (row: PaletteSubItemRow) => {
      // The tag list stays open so several tags can be set in one visit; the
      // transition list closes, because picking a status is the whole errand.
      if (!staysOpen) dispatch({ type: 'closed' })
      row.run()
    },
    [staysOpen],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (display.status === 'closed') return
      const intent = paletteKeyIntent(event, LEVEL_FOR_STATUS[display.status])
      if (intent === null) return
      if (
        dispatchIntent(intent, display, { dispatch, close, back, choose, runAction, runSubItem })
      ) {
        event.preventDefault()
      }
    },
    [display, close, back, choose, runAction, runSubItem],
  )

  return {
    display,
    setQuery: useCallback((query: string) => dispatch({ type: 'queryChanged', query }), []),
    close,
    back,
    highlight: useCallback((index: number) => dispatch({ type: 'highlighted', index }), []),
    choose,
    runAction,
    runSubItem,
    onKeyDown,
  }
}

type IntentTargets = {
  readonly dispatch: (event: PaletteEvent) => void
  readonly close: () => void
  readonly back: () => void
  readonly choose: (row: PaletteRow) => void
  readonly runAction: (row: PaletteActionRow) => void
  readonly runSubItem: (row: PaletteSubItemRow) => void
}

type OpenDisplay = Exclude<PaletteDisplay, { status: 'closed' }>

function listLength(display: OpenDisplay): number {
  return (
    match(display)
      .with({ status: 'root' }, (d) => d.rowCount)
      .with({ status: 'actions' }, (d) => d.actionCount)
      .with({ status: 'sub-list' }, (d) => d.rowCount)
      // The help table is not navigable — the browser scrolls it.
      .with({ status: 'help' }, () => 0)
      .exhaustive()
  )
}

/** Returns whether the intent was handled, so the caller can `preventDefault`. */
function dispatchIntent(
  intent: PaletteIntent,
  display: OpenDisplay,
  targets: IntentTargets,
): boolean {
  return match(intent)
    .with({ kind: 'next' }, () => {
      targets.dispatch({ type: 'moved', delta: 1, count: listLength(display) })
      return true
    })
    .with({ kind: 'prev' }, () => {
      targets.dispatch({ type: 'moved', delta: -1, count: listLength(display) })
      return true
    })
    .with({ kind: 'enter' }, () =>
      match(display)
        .with({ status: 'root' }, (d) => {
          if (d.selectedRow === null) return false
          targets.choose(d.selectedRow)
          return true
        })
        .with({ status: 'actions' }, (d) => {
          if (d.selectedAction === null) return false
          targets.runAction(d.selectedAction)
          return true
        })
        .with({ status: 'sub-list' }, (d) => {
          if (d.selectedRow === null) return false
          targets.runSubItem(d.selectedRow)
          return true
        })
        .with({ status: 'help' }, () => false)
        .exhaustive(),
    )
    .with({ kind: 'close' }, () => {
      targets.close()
      return true
    })
    .with({ kind: 'back' }, () => {
      // The root level has no level above it, and the key map never produces
      // `back` there — this arm is the belt to that braces.
      if (display.status === 'root') return false
      targets.back()
      return true
    })
    .with({ kind: 'action' }, ({ action }) => {
      if (display.status !== 'actions') return false
      const row = display.byKind.get(action)
      if (row !== undefined) targets.runAction(row)
      // Handled either way. A letter bound to an action that is not currently
      // legal must be a **no-op** — not a fall-through to another handler, and
      // not a close. Swallowing it here is what makes that true.
      return true
    })
    .with({ kind: 'help' }, () => {
      // Only from the root level, and only with an empty query — otherwise a
      // question mark could not be typed into a search.
      if (display.status !== 'root' || display.query !== '') return false
      targets.dispatch({ type: 'enteredHelp' })
      return true
    })
    .with({ kind: 'pick' }, ({ index }) => {
      if (display.status !== 'sub-list') return false
      if (display.content.state !== 'ready') return true
      const row = display.content.rows[index]
      if (row !== undefined) targets.runSubItem(row)
      // Swallowed for the same reason as an illegal letter: a digit past the end
      // of a short list must do nothing rather than leak somewhere else.
      return true
    })
    .exhaustive()
}
