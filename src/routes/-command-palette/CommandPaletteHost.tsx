import { CommandPalette } from '~/contexts/command-palette'
import { useWorkspaceActions, WorkspaceActionModals } from '~/contexts/detail'
import { useActionCatalogue } from './use-action-catalogue'
import { useBoardCommands, type BoardFilterState } from './use-board-commands'
import { usePaletteItems } from './use-palette-items'

// The palette's composition root: it reads every context the palette needs and
// hands the palette plain values and plain functions. The palette context itself
// imports none of them (ADR-0008).
//
// The workspace dialogs are mounted here rather than inside the palette, because
// they outlive it: running `e` closes the palette and leaves the branch prompt
// standing, which is the point — the prompt is where you name the branch.
export function CommandPaletteHost({ filter, onFilterChange }: BoardFilterState) {
  const { items, sources } = usePaletteItems()
  const commands = useBoardCommands({ filter, onFilterChange })
  const workspace = useWorkspaceActions()
  const actionsFor = useActionCatalogue({ workspace })

  return (
    <>
      <CommandPalette items={items} sources={sources} commands={commands} actionsFor={actionsFor} />
      <WorkspaceActionModals api={workspace} />
    </>
  )
}
