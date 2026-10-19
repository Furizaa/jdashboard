import { createFileRoute } from '@tanstack/react-router'
import { GanttShell } from './-gantt/GanttShell'
import { validateGanttSearch } from './-gantt/gantt-search'

export const Route = createFileRoute('/gantt')({
  component: GanttPage,
  validateSearch: validateGanttSearch,
})

function GanttPage() {
  // `?issue=` opens the ticket panel in the chrome's overlay and `?node=` is the
  // palette's `g` hand-off, revealed on arrival and then consumed with `replace`.
  const { chart, issue, node } = Route.useSearch()
  return <GanttShell chart={chart} issue={issue} node={node} />
}
