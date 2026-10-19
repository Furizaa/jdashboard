import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { match } from 'ts-pattern'
import { History } from 'lucide-react'
import type { GanttChangelogActor, GanttChangelogEntry } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import { useChartChangelog } from '../presenter'

// "What has the agent been doing to my plan", rendered rather than left in a
// file. ADR-0012 §11 makes this part of the visibility the feature exists for:
// an application that is the system of record for something and keeps no record
// of what was done to it does not square.
//
// Read-only like everything else on this surface — there is no undo button here.
// One level of body undo exists as `bodies/<id>.md.prev` on disk, and more than
// one level is the named trigger for taking git over `~/.clashboard/gantt/`.

/** Three actors, three stories: an API write, a Jira sync, a lifecycle verb. */
function actorTone(actor: GanttChangelogActor): string {
  return match(actor)
    .with('agent', () => 'text-sky-400')
    .with('sync', () => 'text-emerald-400')
    .with('user', () => 'text-ink-subtle')
    .exhaustive()
}

export function ChangelogPopover({ chartId }: { chartId: string }) {
  const [open, setOpen] = useState(false)
  const { entries, isLoading } = useChartChangelog(chartId)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        data-testid={testIds.ganttChangelog}
        aria-expanded={open}
        aria-label="What the agent has done to this chart"
        title="Changelog"
        className={cn(
          'focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none',
          open
            ? 'border-border-strong bg-surface-2 text-foreground'
            : 'border-border text-ink-subtle hover:text-foreground hover:bg-surface-2',
        )}
      >
        <History size={12} aria-hidden />
        <span>Changelog</span>
      </button>
      {open && (
        <div className="border-border bg-popover absolute top-8 right-0 z-30 max-h-80 w-96 overflow-y-auto rounded-md border p-2 shadow-lg">
          <Entries entries={entries} isLoading={isLoading} />
        </div>
      )}
    </div>
  )
}

function Entries({
  entries,
  isLoading,
}: {
  entries: readonly GanttChangelogEntry[]
  isLoading: boolean
}) {
  if (isLoading) return <p className="text-ink-tertiary px-1 py-1.5 text-xs">Reading…</p>
  if (entries.length === 0) {
    return (
      <p className="text-ink-tertiary px-1 py-1.5 text-xs">
        Nothing has been written to this chart yet.
      </p>
    )
  }
  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <li key={`${entry.at}-${entry.summary}`} className="px-1 py-1 text-[11px] leading-relaxed">
          <span className={cn('font-medium', actorTone(entry.actor))}>{entry.actor}</span>
          <span className="text-ink-tertiary"> · {relative(entry.at)}</span>
          <p className="text-foreground/90">{entry.summary}</p>
        </li>
      ))}
    </ul>
  )
}

function relative(at: string): string {
  const parsed = Date.parse(at)
  return Number.isNaN(parsed) ? at : `${formatDistanceToNow(parsed)} ago`
}
