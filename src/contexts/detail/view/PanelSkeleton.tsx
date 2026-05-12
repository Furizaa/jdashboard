import { Skeleton } from '~/design-system'

export function PanelSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_200px] gap-8 p-7">
      <div className="min-w-0 space-y-3">
        <Skeleton className="h-6 w-3/4 rounded" />
        <div className="space-y-2 pt-3">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-5/6 rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>
      </div>
      <div className="space-y-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2 w-12 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
