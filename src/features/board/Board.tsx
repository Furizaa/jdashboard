import { useMemo } from 'react'
import { useBoardIssues } from './use-board-issues'
import { useChangeIndication, type LeavingIssue } from './use-change-indication'
import { COLUMNS, columnForStatus, type Column } from './status-mapping'
import { filterIssues } from './filter-issues'
import type { BoardIssue } from '~/server/jira'
import { TicketCard, type TicketCardAnimationState } from '~/features/ticket-card'
import { usePolling } from '~/lib/use-polling'

const POLL_INTERVAL_MS = 60_000

type ColumnItem = {
  issue: BoardIssue | LeavingIssue
  state: TicketCardAnimationState
}

export function Board({ searchQuery }: { searchQuery: string }) {
  const query = useBoardIssues()
  usePolling(() => {
    query.refetch()
  }, POLL_INTERVAL_MS)

  const liveIssues = query.data?.ok === true ? query.data.issues : undefined
  const { enteringKeys, changedKeys, leaving } = useChangeIndication(liveIssues)

  const itemsByColumn = useMemo<Record<Column, ColumnItem[]>>(() => {
    const empty: Record<Column, ColumnItem[]> = {
      'TO DO': [],
      'In Implementation': [],
      'In Code Review': [],
      Done: [],
    }
    if (liveIssues === undefined) return empty
    for (const issue of filterIssues(liveIssues, searchQuery)) {
      const state: TicketCardAnimationState = enteringKeys.has(issue.key)
        ? 'entering'
        : changedKeys.has(issue.key)
          ? 'changed'
          : 'idle'
      empty[columnForStatus(issue.statusName)].push({ issue, state })
    }
    for (const leavingIssue of filterIssues([...leaving.values()], searchQuery)) {
      empty[leavingIssue.column].push({ issue: leavingIssue, state: 'leaving' })
    }
    return empty
  }, [liveIssues, enteringKeys, changedKeys, leaving, searchQuery])

  if (query.isPending) {
    return <BoardSkeleton />
  }

  if (query.isError && query.data === undefined) {
    return (
      <BoardMessage tone="destructive">
        Couldn't load board: {query.error instanceof Error ? query.error.message : 'unknown error'}
      </BoardMessage>
    )
  }

  if (query.data === undefined || query.data.ok === false) {
    return <BoardMessage tone="destructive">Invalid Jira credentials.</BoardMessage>
  }

  if (query.data.issues.length === 0) {
    return <EmptyBoardMessage />
  }

  const { baseUrl } = query.data
  const showErrorBanner = query.isError

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showErrorBanner && (
        <ErrorBanner
          errorMessage={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => query.refetch()}
        />
      )}
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-4 p-4">
        {COLUMNS.map((column) => (
          <BoardColumn
            key={column}
            column={column}
            items={itemsByColumn[column]}
            baseUrl={baseUrl}
          />
        ))}
      </div>
    </div>
  )
}

function BoardColumn({
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
          items.map(({ issue, state }) => (
            <TicketCard
              key={issue.key}
              issue={issue}
              baseUrl={baseUrl}
              animationState={state}
            />
          ))
        )}
      </div>
    </section>
  )
}

function BoardMessage({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'muted' | 'destructive'
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p
        className={
          tone === 'destructive' ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'
        }
      >
        {children}
      </p>
    </div>
  )
}

const SKELETON_CARDS_PER_COLUMN = 4

function BoardSkeleton() {
  return (
    <div className="grid h-full grid-cols-4 gap-4 p-4" aria-hidden>
      {COLUMNS.map((column) => (
        <section key={column} className="flex min-h-0 flex-col">
          <header className="mb-2 flex items-baseline gap-2 px-1">
            <h2 className="text-foreground text-sm font-semibold tracking-wide">{column}</h2>
          </header>
          <div className="flex flex-1 flex-col gap-2 overflow-hidden pr-1">
            {Array.from({ length: SKELETON_CARDS_PER_COLUMN }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="border-border bg-card rounded-md border px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="skeleton-shimmer h-3.5 w-3.5 shrink-0 rounded-sm" />
        <div className="skeleton-shimmer h-3 w-16 rounded" />
        <div className="skeleton-shimmer ml-auto h-5 w-20 rounded-full" />
      </div>
      <div className="mt-1.5 space-y-1.5">
        <div className="skeleton-shimmer h-3 w-full rounded" />
        <div className="skeleton-shimmer h-3 w-3/4 rounded" />
      </div>
    </div>
  )
}

function EmptyBoardMessage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="border-border bg-card max-w-md rounded-xl border p-6 shadow-lg">
        <h2 className="text-foreground text-xl font-semibold">No tickets match your filters</h2>
        <div className="text-muted-foreground mt-2 text-sm leading-relaxed">
          <p>
            The configured JQL returned zero results. This is normal when filters are tight — you
            may want to adjust{' '}
            <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">
              JIRA_PROJECT_KEY
            </code>{' '}
            or{' '}
            <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">
              JIRA_LABEL_FILTER
            </code>{' '}
            in your{' '}
            <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">
              .env
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

function ErrorBanner({
  errorMessage,
  onRetry,
}: {
  errorMessage: string | undefined
  onRetry: () => void
}) {
  const retrySeconds = Math.round(POLL_INTERVAL_MS / 1000)
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 mx-4 mt-4 flex shrink-0 items-center gap-3 rounded-md border px-3 py-2 text-sm"
    >
      <span className="text-destructive font-medium">Couldn't reach Jira.</span>
      <span className="text-muted-foreground" title={errorMessage}>
        Retrying in {retrySeconds}s.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="text-foreground hover:bg-muted focus-visible:ring-ring ml-auto rounded px-2 py-1 text-xs underline underline-offset-2 transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        Retry now
      </button>
    </div>
  )
}
