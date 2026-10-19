import { match } from 'ts-pattern'
import { ChartGantt } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { GanttChartSummary } from '~/kernel'
import { testIds } from '~/lib/testids'
import { useChartList } from '../presenter'

// `/gantt` with no `?chart=`: every chart on disk, as rows.
//
// A row carries the three things that decide whether this is the chart you
// meant — its title, the epics it mirrors, and how much of it is done — and
// nothing else. The counts come from the store's summary rather than from a
// chart read, so a list of twenty charts does not carry every node in all of
// them (ADR-0012 §11).

export function ChartList({ onSelect }: { onSelect: (chartId: string) => void }) {
  const list = useChartList()

  return (
    <div data-testid={testIds.ganttChartList} className="h-full min-h-0 overflow-y-auto p-5">
      {match(list)
        .with({ phase: 'loading' }, () => <ListMessage>Reading charts…</ListMessage>)
        .with({ phase: 'error' }, ({ message }) => (
          <ListMessage tone="destructive">{message}</ListMessage>
        ))
        .with({ phase: 'empty' }, () => (
          <ListMessage>
            <ChartGantt size={22} className="mb-2.5 opacity-70" aria-hidden />
            No charts yet. An agent creates one through the Gantt API; this surface reads them.
          </ListMessage>
        ))
        .with({ phase: 'ready' }, ({ charts }) => (
          <ul className="mx-auto flex max-w-3xl flex-col gap-2">
            {charts.map((chart) => (
              <li key={chart.id}>
                <ChartRow chart={chart} onSelect={() => onSelect(chart.id)} />
              </li>
            ))}
          </ul>
        ))
        .exhaustive()}
    </div>
  )
}

function ChartRow({ chart, onSelect }: { chart: GanttChartSummary; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testIds.ganttChartRow}
      data-chart-id={chart.id}
      className="border-border bg-surface-1 hover:bg-surface-2 hover:border-border-strong focus-visible:ring-ring flex w-full flex-col gap-1.5 rounded-md border px-3.5 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="flex items-baseline gap-2">
        <span className="text-foreground text-sm font-medium tracking-[-0.01em]">
          {chart.title}
        </span>
        <span className="text-ink-tertiary font-mono text-[10px]">{chart.id}</span>
        <span className="text-ink-subtle ml-auto text-[11px] tabular-nums">
          {chart.doneCount} of {chart.nodeCount} done
        </span>
      </span>
      <span className="text-ink-tertiary flex items-center gap-2 text-[11px]">
        <span>
          {chart.jiraSources.length === 0
            ? 'No Jira sources'
            : `Epics: ${chart.jiraSources.join(', ')}`}
        </span>
        <span aria-hidden>·</span>
        <span>
          {chart.lastSyncedAt === null
            ? 'Never synced'
            : `Synced ${formatDistanceToNow(Date.parse(chart.lastSyncedAt))} ago`}
        </span>
      </span>
    </button>
  )
}

function ListMessage({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'destructive'
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div
        className={
          tone === 'destructive'
            ? 'text-destructive max-w-sm text-center text-sm'
            : 'text-ink-subtle flex max-w-sm flex-col items-center text-center text-sm'
        }
      >
        {children}
      </div>
    </div>
  )
}
