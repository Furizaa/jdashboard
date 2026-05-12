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

  return (
    <header className="bg-background border-border flex h-14 shrink-0 items-center gap-3 border-b px-5">
      <span className="flex items-center gap-2.5">
        <Logo />
        <span className="text-foreground text-[15px] font-semibold tracking-[-0.015em]">
          clashboard
        </span>
      </span>
      <span className="bg-border mx-1 h-4 w-px" aria-hidden />
      <QuickCreateButton />
      <SearchInput value={searchQuery} onChange={onSearchChange} />
      <div className="ml-auto flex items-center gap-2">
        <GitlabIndicator />
        <SyncIndicator query={query} onRefresh={refresh} />
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh"
          data-testid={testIds.refreshButton}
          className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : undefined} />
        </button>
      </div>
    </header>
  )
}

function SyncIndicator({
  query,
  onRefresh,
}: {
  query: ReturnType<typeof useBoardData>
  onRefresh: () => void
}) {
  if (query.isError) {
    const errorMessage = query.error instanceof Error ? query.error.message : 'Unknown error'
    return (
      <button
        type="button"
        onClick={onRefresh}
        title={errorMessage}
        data-testid={testIds.syncIndicator}
        className="text-destructive hover:text-destructive/80 focus-visible:ring-ring rounded-md px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        Sync failed · Retry
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onRefresh}
      data-testid={testIds.syncIndicator}
      className="text-ink-subtle hover:text-foreground focus-visible:ring-ring rounded-md px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      {syncedLabel(query.dataUpdatedAt, query.isFetching)}
    </button>
  )
}

function syncedLabel(updatedAt: number, isFetching: boolean): string {
  if (updatedAt === 0) return isFetching ? 'Syncing…' : 'Not synced'
  return `Synced ${formatDistanceToNow(updatedAt)} ago`
}
