import { ChevronsLeft } from 'lucide-react'
import { resolveTagColor } from '~/kernel'
import { testIds } from '~/lib/testids'
import type { WatchlistLane } from '../domain/assemble-lanes'

/** A thin, clickable rail standing in for a collapsed lane. Click to expand.
 * Mirrors the main board's `CollapsedColumn`, keyed on the lane's tag. */
export function CollapsedLane({ lane, onExpand }: { lane: WatchlistLane; onExpand: () => void }) {
  const laneLabel = lane.tags.map((t) => t.name).join(' / ')
  return (
    <button
      type="button"
      onClick={onExpand}
      data-testid={testIds.watchlistLaneCollapsed}
      title={`Expand ${laneLabel}`}
      aria-label={`Expand ${laneLabel} lane`}
      className="group bg-surface-1 border-border hover:bg-surface-2 flex w-11 shrink-0 flex-col items-center gap-3 rounded-md border py-3"
    >
      <ChevronsLeft
        size={16}
        className="text-ink-tertiary group-hover:text-ink-subtle shrink-0"
        aria-hidden
      />
      <span className="flex shrink-0 flex-col items-center gap-1">
        {lane.tags.slice(0, 3).map((tag) => (
          <span
            key={tag.id}
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: resolveTagColor(tag.colorId).swatchBg }}
            aria-hidden
          />
        ))}
      </span>
      <span className="text-ink-tertiary bg-surface-3 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums">
        {lane.items.length}
      </span>
      <span className="text-ink-subtle text-[11px] font-medium tracking-[0.04em] [writing-mode:vertical-rl]">
        {laneLabel}
      </span>
    </button>
  )
}
