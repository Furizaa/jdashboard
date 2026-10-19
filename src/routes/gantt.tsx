import { createFileRoute } from '@tanstack/react-router'
import { GanttShell } from './-gantt/GanttShell'
import { validateGanttSearch } from './-gantt/gantt-search'

export const Route = createFileRoute('/gantt')({
  component: GanttPage,
  validateSearch: validateGanttSearch,
})

function GanttPage() {
  // `?issue=` and `?node=` are part of the search contract and are consumed in
  // slice 96 — the detail panel in the chrome's overlay, and the palette's `g`
  // hand-off revealing a lane. Validated here from the start so a link written
  // today survives.
  const { chart } = Route.useSearch()
  return <GanttShell chart={chart} />
}
