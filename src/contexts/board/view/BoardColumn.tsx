import { match } from 'ts-pattern'
import { ChevronsRight, Eye } from 'lucide-react'
import { TicketCard, buildCardView } from '~/widgets/ticket-card'
import { testIds } from '~/lib/testids'
import type { Column } from '~/kernel'
import type { ColumnItem } from '../domain'

function CardFor({ item, column, baseUrl }: { item: ColumnItem; column: Column; baseUrl: string }) {
  return (
    <TicketCard
      view={match(item.card)
        .with({ kind: 'jira' }, ({ issue }) =>
          buildCardView({ kind: 'jira', issue, column, baseUrl }),
        )
        .with({ kind: 'review' }, ({ card: rc }) =>
          buildCardView({ kind: 'review', card: rc, column, baseUrl }),
        )
        .with({ kind: 'watchlist' }, ({ issue }) =>
          buildCardView({ kind: 'watchlist', issue, column, baseUrl }),
        )
        .exhaustive()}
      animationState={item.state}
    />
  )
}

export function BoardColumn({
  column,
  items,
  baseUrl,
  onCollapse,
}: {
  column: Column
  items: ColumnItem[]
  baseUrl: string
  onCollapse?: () => void
}) {
  const mainItems = items.filter((item) => item.section === 'main')
  const watchlistItems = items.filter((item) => item.section === 'watchlist')
  const liveCount = mainItems.filter((item) => item.state !== 'leaving').length
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="mb-3 flex items-center gap-2 px-0.5">
        <h2 className="text-ink-subtle text-[11px] font-medium tracking-[0.04em] uppercase">
          {column}
        </h2>
        <span className="text-ink-tertiary bg-surface-2 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums">
          {liveCount}
        </span>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            data-testid={testIds.collapseColumnButton}
            title={`Collapse ${column}`}
            aria-label={`Collapse ${column} column`}
            className="text-ink-tertiary hover:text-ink-subtle hover:bg-surface-2 -mr-0.5 ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
          >
            <ChevronsRight size={14} aria-hidden />
          </button>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
        {mainItems.length === 0 && watchlistItems.length === 0 ? (
          <p className="text-ink-tertiary px-0.5 py-1 text-xs">No tickets</p>
        ) : (
          mainItems.map((item) => (
            <CardFor key={item.id} item={item} column={column} baseUrl={baseUrl} />
          ))
        )}
        {watchlistItems.length > 0 && (
          <div data-testid={testIds.watchlistSection} className="flex flex-col gap-2.5">
            <div className="mt-1 flex items-center gap-2 px-0.5">
              <span className="bg-border h-px flex-1" aria-hidden />
              <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-[0.06em] text-purple-400 uppercase">
                <Eye size={11} />
                Watchlist
              </span>
              <span className="bg-border h-px flex-1" aria-hidden />
            </div>
            {watchlistItems.map((item) => (
              <CardFor key={item.id} item={item} column={column} baseUrl={baseUrl} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
