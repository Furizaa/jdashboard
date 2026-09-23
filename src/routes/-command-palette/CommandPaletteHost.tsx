import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import { CommandPalette } from '~/contexts/command-palette'
import { workItemJiraKey, type WorkItem } from '~/kernel'
import { useBoardCommands, type BoardFilterState } from './use-board-commands'
import { usePaletteItems } from './use-palette-items'

// The palette's composition root: it reads every context the palette needs and
// hands the palette plain values and plain functions. The palette context itself
// imports none of them (ADR-0008).
export function CommandPaletteHost({ filter, onFilterChange }: BoardFilterState) {
  const navigate = useNavigate()
  const { items, sources } = usePaletteItems()
  const commands = useBoardCommands({ filter, onFilterChange })

  // Mirrors what clicking the equivalent board card does: a Jira-backed item
  // opens the detail panel on whichever board you are on (`to: '.'`), and a fake
  // review card — an MR with no ticket — opens the MR, because there is no panel
  // for it to open.
  const onOpenItem = useCallback(
    (item: WorkItem) => {
      const key = workItemJiraKey(item)
      if (key !== null) {
        navigate({ to: '.', search: { issue: key } })
        return
      }
      match(item)
        .with({ kind: 'review-fake' }, (i) => {
          window.open(i.card.webUrl, '_blank', 'noopener,noreferrer')
        })
        .otherwise(() => {})
    },
    [navigate],
  )

  return (
    <CommandPalette items={items} sources={sources} commands={commands} onOpenItem={onOpenItem} />
  )
}
