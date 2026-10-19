import { X } from 'lucide-react'
import { testIds } from '~/lib/testids'

// Which lane's dependency waterfall is on screen, and the way back out of it.
//
// The chart draws **no** arrows until a lane is selected (ADR-0012 §10's
// amendment), and selecting one dims every lane outside its waterfall. That
// leaves a reader looking at a chart that is mostly faded with no obvious
// undo — clicking the lit bar again works, but only once you have found it
// again. So the selection says its own name in the header and carries the
// dismiss, which is the same shape `NeedsAttention` uses one slot over.

export function SelectionBanner({
  nodeId,
  title,
  depth,
  onClear,
}: {
  /** The **re-anchored** selection, which on a collapsed chart is an ancestor. */
  nodeId: string | null
  title: string
  /** How many lanes the waterfall covers, the selected one included. */
  depth: number
  onClear: () => void
}) {
  if (nodeId === null) return null
  return (
    <span
      data-testid={testIds.ganttSelection}
      data-node-id={nodeId}
      className="border-primary/40 bg-primary/10 text-ink-subtle inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border py-0 pr-1 pl-2.5 text-[11px]"
    >
      <span className="max-w-64 truncate">
        Waterfall of <span className="text-foreground font-medium">{title}</span>
      </span>
      <span className="text-ink-tertiary tabular-nums">
        {depth} {depth === 1 ? 'lane' : 'lanes'}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear the selection and hide the arrows"
        title="Clear selection"
        className="text-ink-tertiary hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <X size={11} aria-hidden />
      </button>
    </span>
  )
}
