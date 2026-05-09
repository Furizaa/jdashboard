export function PanelSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_180px] gap-6 p-6">
      <div className="min-w-0 space-y-3">
        <div className="bg-muted h-6 w-3/4 animate-pulse rounded" />
        <div className="space-y-2 pt-3">
          <div className="bg-muted h-3 w-full animate-pulse rounded" />
          <div className="bg-muted h-3 w-5/6 animate-pulse rounded" />
          <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="bg-muted h-2 w-12 animate-pulse rounded" />
            <div className="bg-muted h-3 w-20 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
