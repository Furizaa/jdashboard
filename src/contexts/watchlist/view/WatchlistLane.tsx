import { ChevronsRight } from 'lucide-react'
import { TicketCard, buildCardView } from '~/widgets/ticket-card'
import { resolveTagColor } from '~/kernel'
import { testIds } from '~/lib/testids'
import type { WatchlistLane as Lane } from '../domain/assemble-lanes'

// Watchlist cards always carry the In Implementation column's card treatment
// (matching how the main board pins them), regardless of their real Jira status.
const CARD_COLUMN = 'In Implementation' as const

/** One expanded swimlane: a tag-chip header, a card count, a collapse control,
 * and the cards carrying this lane's tag. The watchlist-board analogue of
 * `BoardColumn`; every lane is collapsible (there is no "main" board column). */
export function WatchlistLane({
  lane,
  baseUrl,
  onCollapse,
}: {
  lane: Lane
  baseUrl: string
  onCollapse: () => void
}) {
  const laneLabel = lane.tags.map((t) => t.name).join(' / ')
  return (
    <section data-testid={testIds.watchlistLane} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="mb-3 flex items-center gap-2 px-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {lane.tags.map((tag) => {
            const color = resolveTagColor(tag.colorId)
            return (
              <span
                key={tag.id}
                className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: color.swatchBg, color: color.swatchFg }}
              >
                <span className="truncate">{tag.name}</span>
              </span>
            )
          })}
        </span>
        <span className="text-ink-tertiary bg-surface-2 inline-flex h-4 min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums">
          {lane.items.length}
        </span>
        <button
          type="button"
          onClick={onCollapse}
          data-testid={testIds.watchlistLaneCollapse}
          title={`Collapse ${laneLabel}`}
          aria-label={`Collapse ${laneLabel} lane`}
          className="text-ink-tertiary hover:text-ink-subtle hover:bg-surface-2 -mr-0.5 ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
        >
          <ChevronsRight size={14} aria-hidden />
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
        {lane.items.length === 0 ? (
          <p className="text-ink-tertiary px-0.5 py-1 text-xs">No tickets</p>
        ) : (
          lane.items.map((issue) => (
            <TicketCard
              key={issue.key}
              view={buildCardView({ kind: 'watchlist', issue, column: CARD_COLUMN, baseUrl })}
              animationState="idle"
            />
          ))
        )}
      </div>
    </section>
  )
}
