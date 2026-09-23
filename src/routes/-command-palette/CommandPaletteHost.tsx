import { useCallback, useState } from 'react'
import { CommandPalette } from '~/contexts/command-palette'
import { useWorkspaceActions, WorkspaceActionModals } from '~/contexts/detail'
import { workItemJiraKey, type WorkItem } from '~/kernel'
import { useActionCatalogue } from './use-action-catalogue'
import { useBoardCommands, type BoardCommandsState } from './use-board-commands'
import { usePaletteItems } from './use-palette-items'
import { useSubLists } from './use-sub-lists'

// The palette's composition root: it reads every context the palette needs and
// hands the palette plain values and plain functions. The palette context itself
// imports none of them (ADR-0008).
//
// The workspace dialogs are mounted here rather than inside the palette, because
// they outlive it: running `e` closes the palette and leaves the branch prompt
// standing, which is the point — the prompt is where you name the branch.
export function CommandPaletteHost(board: BoardCommandsState) {
  const { items, sources } = usePaletteItems()
  const commands = useBoardCommands(board)
  const workspace = useWorkspaceActions()

  // Which ticket the palette is pointed at, announced by the palette when an
  // item's action list is entered. This is what keeps the transitions fetch to
  // one request per item visited rather than one per search result typed.
  const [activeItem, setActiveItem] = useState<WorkItem | null>(null)
  const activeKey = activeItem === null ? null : workItemJiraKey(activeItem)
  const { subListFor, transitions, tagCount } = useSubLists(activeKey)
  const actionsFor = useActionCatalogue({ workspace, transitions, tagCount })

  const onActiveItemChange = useCallback((item: WorkItem | null) => setActiveItem(item), [])

  return (
    <>
      <CommandPalette
        items={items}
        sources={sources}
        commands={commands}
        actionsFor={actionsFor}
        subListFor={subListFor}
        onActiveItemChange={onActiveItemChange}
      />
      <WorkspaceActionModals api={workspace} />
    </>
  )
}
