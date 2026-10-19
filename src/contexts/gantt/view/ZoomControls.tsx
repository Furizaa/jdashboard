import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { GanttZoom } from '../view-model'

// Three fixed zooms, each with its own honest tick vocabulary — days at week,
// ISO weeks at month, months at quarter (ADR-0012 §10).
//
// Continuous zoom was rejected: the tick-density algorithm is the fiddliest code
// in any timeline and the hardest to make look deliberate at every scale. Three
// buttons also mean the reader can say which view they are looking at.

const ZOOMS: readonly { readonly zoom: GanttZoom; readonly label: string }[] = [
  { zoom: 'week', label: 'Week' },
  { zoom: 'month', label: 'Month' },
  { zoom: 'quarter', label: 'Quarter' },
]

export function ZoomControls({
  zoom,
  onZoom,
}: {
  zoom: GanttZoom
  onZoom: (zoom: GanttZoom) => void
}) {
  return (
    <div
      data-testid={testIds.ganttZoom}
      role="group"
      aria-label="Zoom"
      className="border-border bg-surface-1 inline-flex h-7 items-center rounded-md border p-0.5"
    >
      {ZOOMS.map((option) => (
        <button
          key={option.zoom}
          type="button"
          onClick={() => onZoom(option.zoom)}
          aria-pressed={zoom === option.zoom}
          data-zoom={option.zoom}
          className={cn(
            'focus-visible:ring-ring inline-flex h-6 items-center rounded px-2 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
            zoom === option.zoom
              ? 'bg-surface-3 text-foreground'
              : 'text-ink-subtle hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
