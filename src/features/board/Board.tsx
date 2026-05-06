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
    return <BoardMessage tone="muted">Loading board…</BoardMessage>
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

  const { baseUrl } = query.data

  return (
    <div className="grid h-full grid-cols-4 gap-4 p-4">
      {COLUMNS.map((column) => (
        <BoardColumn
          key={column}
          column={column}
          items={itemsByColumn[column]}
          baseUrl={baseUrl}
        />
      ))}
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
