import { match } from 'ts-pattern'
import { COLUMNS } from '~/kernel'
import { useBoardView } from '../presenter'
import { BoardColumn } from './BoardColumn'
import { BoardMessage } from './BoardMessage'
import { BoardSkeleton } from './BoardSkeleton'
import { EmptyBoard } from './EmptyBoard'
import { ErrorBanner } from './ErrorBanner'

export function Board({ searchQuery }: { searchQuery: string }) {
  const view = useBoardView(searchQuery)

  return match(view)
    .with({ phase: 'loading' }, () => <BoardSkeleton />)
    .with({ phase: 'error-hard' }, ({ message }) => (
      <BoardMessage tone="destructive">{message}</BoardMessage>
    ))
    .with({ phase: 'unauthorized' }, () => (
      <BoardMessage tone="destructive">Invalid Jira credentials.</BoardMessage>
    ))
    .with({ phase: 'empty' }, () => <EmptyBoard />)
    .with({ phase: 'ready' }, (ready) => (
      <div className="flex h-full min-h-0 flex-col">
        {ready.showErrorBanner && (
          <ErrorBanner errorMessage={ready.errorMessage} onRetry={ready.retry} />
        )}
        <div className="grid min-h-0 flex-1 grid-cols-4 gap-5 p-5">
          {COLUMNS.map((column) => (
            <BoardColumn
              key={column}
              column={column}
              items={ready.itemsByColumn[column]}
              baseUrl={ready.baseUrl}
            />
          ))}
        </div>
      </div>
    ))
    .exhaustive()
}
