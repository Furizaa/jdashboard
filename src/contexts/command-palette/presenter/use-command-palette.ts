import { useCallback, useEffect, useReducer } from 'react'
import { match } from 'ts-pattern'
import { workItemId, type WorkItem } from '~/kernel'
import {
  isPaletteHotkey,
  isTextEntryElement,
  paletteKeyIntent,
  type PaletteAction,
  type PaletteCommandSource,
  type PaletteIntent,
  type PaletteSourceNote,
} from '../domain'
import {
  derivePalette,
  initialPaletteState,
  paletteQuery,
  reducePalette,
  type PaletteActionRow,
  type PaletteDisplay,
  type PaletteEvent,
  type PaletteRow,
} from '../view-model'

export type CommandPaletteDeps = {
  /** Every work item the palette can find, already deduped, from every source. */
  readonly items: readonly WorkItem[]
  /** Sources not contributing yet, surfaced in the footer. */
  readonly sources: readonly PaletteSourceNote[]
  readonly commands: PaletteCommandSource
  /** The legal actions for one item — the cross-context assembly, injected. */
  readonly actionsFor: (item: WorkItem) => readonly PaletteAction[]
}

export type CommandPaletteApi = {
  readonly display: PaletteDisplay
  readonly setQuery: (query: string) => void
  readonly close: () => void
  readonly back: () => void
  readonly highlight: (index: number) => void
  readonly choose: (row: PaletteRow) => void
  readonly runAction: (row: PaletteActionRow) => void
  readonly onKeyDown: (event: React.KeyboardEvent) => void
}

/**
 * The only React-bound module in the palette: the global ⌘K listener, focus
 * handoff to the query field, and the reducer binding. Every decision it makes
 * is made by `palette-key-intent` and `palette-view-model`, which are plain
 * functions with no React import.
 */
export function useCommandPalette(deps: CommandPaletteDeps): CommandPaletteApi {
  const [state, dispatch] = useReducer(reducePalette, initialPaletteState)
  const isOpen = state.status !== 'closed'

  // ⌘K toggles from anywhere. Opening never yanks focus out of another text
  // input mid-sentence — the guard inherited from the deleted header search box.
  // Closing ignores that guard, since the input it would be stealing from is the
  // palette's own query field.
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
  }, [isOpen])

  const display = derivePalette(state, {
    items: deps.items,
    commands: deps.commands(paletteQuery(state)),
    actionsFor: deps.actionsFor,
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
    // The palette closes on a successful action; where an action's own UI takes
    // over instead, that is the action's business — `run` is a closure the
    // assembly built, and the assembly knows which of its actions do that.
    dispatch({ type: 'closed' })
    row.run()
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (display.status === 'closed') return
      const intent = paletteKeyIntent(event, display.status === 'root' ? 'root' : 'list')
      if (intent === null) return
      if (dispatchIntent(intent, display, { dispatch, close, back, choose, runAction })) {
        event.preventDefault()
      }
    },
    [display, close, back, choose, runAction],
  )

  return {
    display,
    setQuery: useCallback((query: string) => dispatch({ type: 'queryChanged', query }), []),
    close,
    back,
    highlight: useCallback((index: number) => dispatch({ type: 'highlighted', index }), []),
    choose,
    runAction,
    onKeyDown,
  }
}

type IntentTargets = {
  readonly dispatch: (event: PaletteEvent) => void
  readonly close: () => void
  readonly back: () => void
  readonly choose: (row: PaletteRow) => void
  readonly runAction: (row: PaletteActionRow) => void
}

/** Returns whether the intent was handled, so the caller can `preventDefault`. */
function dispatchIntent(
  intent: PaletteIntent,
  display: Exclude<PaletteDisplay, { status: 'closed' }>,
  targets: IntentTargets,
): boolean {
  const count = display.status === 'root' ? display.rowCount : display.actionCount
  return match(intent)
    .with({ kind: 'next' }, () => {
      targets.dispatch({ type: 'moved', delta: 1, count })
      return true
    })
    .with({ kind: 'prev' }, () => {
      targets.dispatch({ type: 'moved', delta: -1, count })
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
      if (display.status === 'root') return false
      const row = display.byKind.get(action)
      if (row !== undefined) targets.runAction(row)
      // Handled either way. A letter bound to an action that is not currently
      // legal must be a **no-op** — not a fall-through to another handler, and
      // not a close. Swallowing it here is what makes that true.
      return true
    })
    .exhaustive()
}
