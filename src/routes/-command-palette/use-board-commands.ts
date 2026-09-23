import { useCallback } from 'react'
import type { PaletteCommand, PaletteCommandSource } from '~/contexts/command-palette'

export type BoardFilterState = {
  /** The current board filter — `''` when none is applied. */
  readonly filter: string
  readonly onFilterChange: (next: string) => void
}

/**
 * The board-filter commands, which are how filtering survives the deletion of
 * the header search box.
 *
 * The mechanism avoids a second input: whatever is already typed into the
 * palette *is* the filter text. "Filter board by '‹query›'" interpolates it, so
 * it also matches whatever was typed — a command whose label contains the query
 * can never be ranked out of the list.
 *
 * Slice 88 adds the rest of the board-level commands to this same source.
 */
export function useBoardCommands({
  filter,
  onFilterChange,
}: BoardFilterState): PaletteCommandSource {
  return useCallback(
    (query: string): readonly PaletteCommand[] => {
      const trimmed = query.trim()
      const commands: PaletteCommand[] = []
      if (trimmed !== '' && trimmed !== filter) {
        commands.push({
          id: 'filter-board',
          label: `Filter board by '${trimmed}'`,
          synonyms: ['narrow', 'search'],
          enabled: true,
          run: () => onFilterChange(trimmed),
        })
      }
      // Only legal while a filter is actually applied — offering "clear" against
      // nothing is the kind of dead command the PRD rules out.
      if (filter !== '') {
        commands.push({
          id: 'clear-board-filter',
          label: `Clear board filter '${filter}'`,
          synonyms: ['reset', 'unfilter', 'show all'],
          enabled: true,
          run: () => onFilterChange(''),
        })
      }
      return commands
    },
    [filter, onFilterChange],
  )
}
