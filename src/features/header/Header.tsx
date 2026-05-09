import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { useBoardData, useRefreshAll } from '~/coordinator'
import { QuickCreateButton } from '~/contexts/capture'
import { testIds } from '~/lib/testids'
import { GitlabIndicator } from './GitlabIndicator'
import { Logo } from './Logo'
import { SearchInput } from './SearchInput'

const TICK_INTERVAL_MS = 5_000

export function Header({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string
  onSearchChange: (value: string) => void
}) {
  const refresh = useRefreshAll()
  const query = useBoardData()

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const errored = query.isError
  const errorMessage =
    query.error instanceof Error ? query.error.message : errored ? 'Unknown error' : ''

  return (
    <header className="border-border flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <span className="flex items-center gap-2">
        <Logo />
        <span className="text-foreground text-sm font-semibold tracking-tight">clashboard</span>
      </span>
      <QuickCreateButton />
      <SearchInput value={searchQuery} onChange={onSearchChange} />
      <div className="ml-auto flex items-center gap-1">
        <GitlabIndicator />
        {errored ? (
          <button
            type="button"
            onClick={refresh}
            title={errorMessage}
            data-testid={testIds.syncIndicator}
            className="text-destructive hover:text-destructive/80 focus-visible:ring-ring rounded px-2 py-1 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
          >
            Sync failed · Retry
          </button>
        ) : (
          <button
            type="button"
            onClick={refresh}
            data-testid={testIds.syncIndicator}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded px-2 py-1 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
          >
            {syncedLabel(query.dataUpdatedAt, query.isFetching)}
          </button>
        )}
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh"
          data-testid={testIds.refreshButton}
          className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:ring-1 focus-visible:outline-none"
        >
          <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : undefined} />
        </button>
      </div>
    </header>
  )
}

function syncedLabel(updatedAt: number, isFetching: boolean): string {
  if (updatedAt === 0) return isFetching ? 'Syncing…' : 'Not synced'
  return `Synced ${formatDistanceToNow(updatedAt)} ago`
}
