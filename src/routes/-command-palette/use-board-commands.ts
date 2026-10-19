import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import type {
  PaletteActionPerform,
  PaletteCommand,
  PaletteCommandSource,
} from '~/contexts/command-palette'
import { useCommands, useGanttCharts, useRefreshAll } from '~/coordinator'
import type { ShellVariant } from '../-app-chrome'
import { COMMAND_TARGETS, globalCommands, type CommandId } from './global-commands'

// The board-level commands: everything the palette can do that is not attached
// to a work item. Which ones are legal is decided by the pure `globalCommands`;
// this module only attaches the effect — the same split as the action catalogue.
//
// They are `Enter`-only, not keyed. The root level owns a text query, so a bare
// letter there types rather than runs; per-item actions get letters precisely
// because the action list has no query field (ADR-0008).

// The four board controls are **optional**, for the same reason the header's
// are: `/explain` is a surface with no board behind it, so there is no filter to
// set and no workspace filter to toggle (ADR-0009 §1). `globalCommands` never
// offers a command whose control is absent, and the no-op fallbacks below exist
// only so this module has no partial function to explain.
export type BoardCommandsState = {
  readonly variant: ShellVariant
  /** The current board filter — `''` when none is applied, absent off a board. */
  readonly filter?: string
  readonly onFilterChange?: (next: string) => void
  readonly onlyWorkspace?: boolean
  readonly onToggleOnlyWorkspace?: () => void
}

const noop = () => {}

/** Sugar so each arm below reads as one line, as the action catalogue's does. */
const run = (fn: () => void): PaletteActionPerform => ({ effect: 'run', run: fn })

export function useBoardCommands(state: BoardCommandsState): PaletteCommandSource {
  const navigate = useNavigate()
  const refresh = useRefreshAll()
  const commands = useCommands()
  // Read for its **count** only: it gates `Open Gantt chart…`, and the list the
  // command then shows is `useSubLists`' business. One query serves both.
  const charts = useGanttCharts()
  const chartCount = charts.data?.charts.length ?? 0
  const { registered, open } = commands
  const { variant } = state
  const filter = state.filter ?? ''
  const onlyWorkspace = state.onlyWorkspace ?? false
  const onFilterChange = state.onFilterChange ?? noop
  const onToggleOnlyWorkspace = state.onToggleOnlyWorkspace ?? noop

  const performFor = useCallback(
    (id: CommandId, query: string): PaletteActionPerform =>
      match(id)
        .with('filter-board', () => run(() => onFilterChange(query.trim())))
        .with('clear-board-filter', () => run(() => onFilterChange('')))
        .with('go-to-board', () => run(() => navigate({ to: '/' })))
        .with('go-to-watchlist', () => run(() => navigate({ to: '/watchlist' })))
        .with('go-to-explain', () => run(() => navigate({ to: '/explain' })))
        .with('refresh', () => run(refresh))
        .with('toggle-only-workspace', () => run(onToggleOnlyWorkspace))
        // The only command that opens a nested list. Which chart is a pick, and
        // the rows come from `useSubLists` beside the other two lists.
        .with('open-gantt-chart', () => ({ effect: 'sub-list', subList: 'charts' }) as const)
        // The five header modals go through the bus. `globalCommands` only
        // offers one whose target is registered, and `open` is a no-op rather
        // than a throw if a route change beats the keypress.
        .with(
          'new-ticket',
          'add-to-watchlist',
          'manage-tags',
          'bulk-refine',
          'configure-lanes',
          (target) =>
            run(() => {
              const busTarget = COMMAND_TARGETS[target]
              if (busTarget !== undefined) open(busTarget)
            }),
        )
        .exhaustive(),
    [navigate, refresh, open, onFilterChange, onToggleOnlyWorkspace],
  )

  return useCallback(
    (query: string): readonly PaletteCommand[] =>
      globalCommands({ variant, query, filter, onlyWorkspace, registered, chartCount }).map(
        (descriptor): PaletteCommand => ({
          id: descriptor.id,
          label: descriptor.label,
          synonyms: descriptor.synonyms,
          enabled: true,
          perform: performFor(descriptor.id, query),
        }),
      ),
    [variant, filter, onlyWorkspace, registered, chartCount, performFor],
  )
}
