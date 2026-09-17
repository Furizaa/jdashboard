import { match } from 'ts-pattern'
import { Layers } from 'lucide-react'
import { testIds } from '~/lib/testids'
import { useCollapsedLanes, useWatchlistBoard } from '../presenter'
import { CollapsedLane } from './CollapsedLane'
import { WatchlistLane } from './WatchlistLane'

export function WatchlistBoard({ searchQuery }: { searchQuery: string }) {
  const view = useWatchlistBoard(searchQuery)
  const { collapsed, toggle } = useCollapsedLanes()

  return match(view)
    .with({ phase: 'loading' }, () => <WatchlistBoardSkeleton />)
    .with({ phase: 'error-hard' }, ({ message }) => (
      <WatchlistBoardMessage tone="destructive">{message}</WatchlistBoardMessage>
    ))
    .with({ phase: 'unauthorized' }, () => (
      <WatchlistBoardMessage tone="destructive">Invalid Jira credentials.</WatchlistBoardMessage>
    ))
    .with({ phase: 'no-lanes' }, () => (
      <WatchlistBoardMessage tone="muted">
        <Layers size={22} className="mb-2.5 opacity-70" aria-hidden />
        No lanes configured yet. Use <span className="text-foreground">Configure lanes</span> in the
        header to map your tags to swimlanes.
      </WatchlistBoardMessage>
    ))
    .with({ phase: 'ready' }, (ready) => {
      // Expanded lanes keep their configured order on the left; collapsed lanes
      // become thin rails that stack to the right (same order among themselves).
      const expanded = ready.lanes.filter((lane) => !collapsed.has(lane.id))
      const collapsedLanes = ready.lanes.filter((lane) => collapsed.has(lane.id))
      return (
        <div data-testid={testIds.watchlistBoard} className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 gap-5 p-5">
            {expanded.map((lane) => (
              <WatchlistLane
                key={lane.id}
                lane={lane}
                baseUrl={ready.baseUrl}
                onCollapse={() => toggle(lane.id)}
              />
            ))}
            {collapsedLanes.map((lane) => (
              <CollapsedLane key={lane.id} lane={lane} onExpand={() => toggle(lane.id)} />
            ))}
          </div>
        </div>
      )
    })
    .exhaustive()
}

function WatchlistBoardMessage({
  tone,
  children,
}: {
  tone: 'destructive' | 'muted'
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

function WatchlistBoardSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 gap-5 p-5">
      {['lane-a', 'lane-b', 'lane-c'].map((laneId) => (
        <div key={laneId} className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="bg-surface-2 mb-1 h-4 w-24 animate-pulse rounded" />
          {['c1', 'c2', 'c3'].map((cardId) => (
            <div
              key={`${laneId}-${cardId}`}
              className="bg-surface-1 h-24 animate-pulse rounded-md"
            />
          ))}
        </div>
      ))}
    </div>
  )
}
