import { useMemo } from 'react'
import { useBoardIssues } from './use-board-issues'
import { COLUMNS, columnForStatus, type Column } from './status-mapping'
import type { BoardIssue } from '~/server/jira'
import { TicketCard } from '~/features/ticket-card'
import { usePolling } from '~/lib/use-polling'

const POLL_INTERVAL_MS = 60_000

export function Board() {
  const query = useBoardIssues()
  usePolling(() => {
    query.refetch()
  }, POLL_INTERVAL_MS)

  const issuesByColumn = useMemo<Record<Column, BoardIssue[]>>(() => {
    const empty: Record<Column, BoardIssue[]> = {
      'TO DO': [],
      'In Implementation': [],
      'In Code Review': [],
      Done: [],
    }
    if (query.data?.ok !== true) return empty
    for (const issue of query.data.issues) {
      empty[columnForStatus(issue.statusName)].push(issue)
    }
    return empty
  }, [query.data])

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
          issues={issuesByColumn[column]}
          baseUrl={baseUrl}
        />
      ))}
    </div>
  )
}

function BoardColumn({
  column,
  issues,
  baseUrl,
}: {
  column: Column
  issues: BoardIssue[]
  baseUrl: string
}) {
  return (
    <section className="flex min-h-0 flex-col">
      <header className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-foreground text-sm font-semibold tracking-wide">{column}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">{issues.length}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {issues.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1 text-xs">No tickets</p>
        ) : (
          issues.map((issue) => <TicketCard key={issue.key} issue={issue} baseUrl={baseUrl} />)
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
