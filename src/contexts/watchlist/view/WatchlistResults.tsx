import { Skeleton } from '~/design-system'
import { testIds } from '~/lib/testids'
import type { WatchlistResultsView } from '../presenter'

const HINT_CLASS = 'text-ink-subtle px-1 py-6 text-center text-[13px]'

export function WatchlistResults({
  results,
  isAdding,
  onAdd,
  onRetry,
}: {
  results: WatchlistResultsView
  isAdding: boolean
  onAdd: (key: string) => void
  onRetry: () => void
}) {
  switch (results.kind) {
    case 'idle':
      return <p className={HINT_CLASS}>Type at least 2 characters to search Jira.</p>
    case 'loading':
      return (
        <div className="flex flex-col gap-1.5 py-1.5" aria-hidden>
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      )
    case 'error':
      return (
        <p className={HINT_CLASS}>
          Search failed —{' '}
          <button
            type="button"
            onClick={onRetry}
            className="text-foreground focus-visible:ring-ring underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            retry
          </button>
        </p>
      )
    case 'empty':
      return <p className={HINT_CLASS}>No matching tickets.</p>
    case 'ready':
      return (
        <ul className="flex flex-col gap-0.5">
          {results.candidates.map((candidate) => (
            <li key={candidate.key}>
              <button
                type="button"
                disabled={isAdding}
                onClick={() => onAdd(candidate.key)}
                data-testid={testIds.watchlistResultRow}
                data-issue-key={candidate.key}
                className="hover:bg-surface-2 focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="text-ink-subtle shrink-0 font-mono text-[11px]">
                  {candidate.key}
                </span>
                <span className="text-foreground flex-1 truncate text-[13px]">
                  {candidate.summary}
                </span>
                <span className="text-ink-tertiary shrink-0 text-[11px]">
                  {candidate.statusName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )
  }
}
