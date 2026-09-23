import { useCallback, useEffect, useReducer } from 'react'
import { match } from 'ts-pattern'
import type { WorkItem } from '~/kernel'
import {
  isPaletteHotkey,
  isTextEntryElement,
  paletteKeyIntent,
  type PaletteCommandSource,
  type PaletteIntent,
  type PaletteSourceNote,
} from '../domain'
import {
  derivePalette,
  initialPaletteState,
  paletteQuery,
  reducePalette,
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
  /** Run when a work-item row is chosen. */
  readonly onOpenItem: (item: WorkItem) => void
}

export type CommandPaletteApi = {
  readonly display: PaletteDisplay
  readonly setQuery: (query: string) => void
  readonly close: () => void
  readonly highlight: (index: number) => void
  readonly choose: (row: PaletteRow) => void
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
    sources: deps.sources,
  })

  const close = useCallback(() => dispatch({ type: 'closed' }), [])

  const choose = useCallback(
    (row: PaletteRow) => {
      match(row.target)
        .with({ kind: 'item' }, ({ item }) => {
          dispatch({ type: 'closed' })
          deps.onOpenItem(item)
        })
        .with({ kind: 'command' }, ({ command }) => {
          if (!command.enabled) return
          dispatch({ type: 'closed' })
          command.run()
        })
        .exhaustive()
    },
    [deps],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (display.status !== 'root') return
      const intent = paletteKeyIntent(event, 'root')
      if (intent === null) return
      if (dispatchIntent(intent, display, { dispatch, close, choose })) event.preventDefault()
    },
    [display, close, choose],
  )

  return {
    display,
    setQuery: useCallback((query: string) => dispatch({ type: 'queryChanged', query }), []),
    close,
    highlight: useCallback((index: number) => dispatch({ type: 'highlighted', index }), []),
    choose,
    onKeyDown,
  }
}

type IntentTargets = {
  readonly dispatch: (event: PaletteEvent) => void
  readonly close: () => void
  readonly choose: (row: PaletteRow) => void
}

/** Returns whether the intent was handled, so the caller can `preventDefault`. */
function dispatchIntent(
  intent: PaletteIntent,
  display: Extract<PaletteDisplay, { status: 'root' }>,
  targets: IntentTargets,
): boolean {
  return (
    match(intent)
      .with({ kind: 'next' }, () => {
        targets.dispatch({ type: 'moved', delta: 1, count: display.rowCount })
        return true
      })
      .with({ kind: 'prev' }, () => {
        targets.dispatch({ type: 'moved', delta: -1, count: display.rowCount })
        return true
      })
      .with({ kind: 'enter' }, () => {
        if (display.selectedRow === null) return false
        targets.choose(display.selectedRow)
        return true
      })
      .with({ kind: 'close' }, () => {
        targets.close()
        return true
      })
      // The root level has no level above it, so `back` never arrives here — the
      // key map only produces it for `list` levels.
      .with({ kind: 'back' }, () => false)
      .exhaustive()
  )
}
