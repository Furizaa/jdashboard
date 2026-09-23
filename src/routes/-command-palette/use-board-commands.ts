import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import type { PaletteCommand, PaletteCommandSource } from '~/contexts/command-palette'
import { useCommands, useRefreshAll } from '~/coordinator'
import type { BoardVariant } from '../-app-shell'
import { COMMAND_TARGETS, globalCommands, type CommandId } from './global-commands'

// The board-level commands: everything the palette can do that is not attached
// to a work item. Which ones are legal is decided by the pure `globalCommands`;
// this module only attaches the effect — the same split as the action catalogue.
//
// They are `Enter`-only, not keyed. The root level owns a text query, so a bare
// letter there types rather than runs; per-item actions get letters precisely
// because the action list has no query field (ADR-0008).

export type BoardCommandsState = {
  readonly variant: BoardVariant
  /** The current board filter — `''` when none is applied. */
  readonly filter: string
  readonly onFilterChange: (next: string) => void
  readonly onlyWorkspace: boolean
  readonly onToggleOnlyWorkspace: () => void
}

export function useBoardCommands(state: BoardCommandsState): PaletteCommandSource {
  const navigate = useNavigate()
  const refresh = useRefreshAll()
  const commands = useCommands()
  const { registered, open } = commands
  const { variant, filter, onFilterChange, onlyWorkspace, onToggleOnlyWorkspace } = state

  const runFor = useCallback(
    (id: CommandId, query: string): (() => void) =>
      match(id)
        .with('filter-board', () => () => onFilterChange(query.trim()))
        .with('clear-board-filter', () => () => onFilterChange(''))
        .with('go-to-board', () => () => navigate({ to: '/' }))
        .with('go-to-watchlist', () => () => navigate({ to: '/watchlist' }))
        .with('refresh', () => refresh)
        .with('toggle-only-workspace', () => onToggleOnlyWorkspace)
        // The five header modals go through the bus. `globalCommands` only
        // offers one whose target is registered, and `open` is a no-op rather
        // than a throw if a route change beats the keypress.
        .with(
          'new-ticket',
          'add-to-watchlist',
          'manage-tags',
          'bulk-refine',
          'configure-lanes',
          (target) => () => {
            const busTarget = COMMAND_TARGETS[target]
            if (busTarget !== undefined) open(busTarget)
          },
        )
        .exhaustive(),
    [navigate, refresh, open, onFilterChange, onToggleOnlyWorkspace],
  )

  return useCallback(
    (query: string): readonly PaletteCommand[] =>
      globalCommands({ variant, query, filter, onlyWorkspace, registered }).map(
        (descriptor): PaletteCommand => ({
          id: descriptor.id,
          label: descriptor.label,
          synonyms: descriptor.synonyms,
          enabled: true,
          run: runFor(descriptor.id, query),
        }),
      ),
    [variant, filter, onlyWorkspace, registered, runFor],
  )
}
