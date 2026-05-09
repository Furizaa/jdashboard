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
      <header className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-foreground text-sm font-semibold tracking-wide">{column}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">{liveCount}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1 text-xs">No tickets</p>
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
