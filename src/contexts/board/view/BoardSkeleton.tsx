import { Skeleton } from '~/design-system'
import { COLUMNS } from '~/kernel'

const SKELETON_CARDS_PER_COLUMN = 4

export function BoardSkeleton() {
  return (
    <div className="grid h-full grid-cols-4 gap-5 p-5" aria-hidden>
      {COLUMNS.map((column) => (
        <section key={column} className="flex min-h-0 flex-col">
          <header className="mb-3 flex items-center gap-2 px-0.5">
            <h2 className="text-ink-subtle text-[11px] font-medium tracking-[0.04em] uppercase">
              {column}
            </h2>
          </header>
          <div className="flex flex-1 flex-col gap-2.5 overflow-hidden pr-0.5">
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
    <div className="border-border bg-card rounded-lg border px-3.5 py-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-sm" />
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="ml-auto h-5 w-20 rounded-full" />
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-3/4 rounded" />
      </div>
    </div>
  )
}
