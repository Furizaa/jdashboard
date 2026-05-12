import { match } from 'ts-pattern'
import { TicketCard, buildCardView } from '~/widgets/ticket-card'
import type { Column } from '~/kernel'
import type { ColumnItem } from '../domain'

export function BoardColumn({
  column,
  items,
  baseUrl,
}: {
  column: Column
  items: ColumnItem[]
  baseUrl: string
}) {
  const liveCount = items.filter((item) => item.state !== 'leaving').length
  return (
    <section className="flex min-h-0 flex-col">
      <header className="mb-3 flex items-center gap-2 px-0.5">
        <h2 className="text-ink-subtle text-[11px] font-medium tracking-[0.04em] uppercase">
          {column}
        </h2>
        <span className="text-ink-tertiary bg-surface-2 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums">
          {liveCount}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
        {items.length === 0 ? (
          <p className="text-ink-tertiary px-0.5 py-1 text-xs">No tickets</p>
        ) : (
          items.map(({ card, id, state }) => (
            <TicketCard
              key={id}
              view={match(card)
                .with({ kind: 'jira' }, ({ issue }) =>
                  buildCardView({ kind: 'jira', issue, column, baseUrl }),
                )
                .with({ kind: 'review' }, ({ card: rc }) =>
                  buildCardView({ kind: 'review', card: rc, column, baseUrl }),
                )
                .exhaustive()}
              animationState={state}
            />
          ))
        )}
      </div>
    </section>
  )
}
