import { ChevronsLeft } from 'lucide-react'
import { testIds } from '~/lib/testids'
import type { Column } from '~/kernel'
import type { ColumnItem } from '../domain'

/** A thin, clickable rail standing in for a collapsed column. Click to expand. */
export function CollapsedColumn({
  column,
  items,
  onExpand,
}: {
  column: Column
  items: ColumnItem[]
  onExpand: () => void
}) {
  const liveCount = items.filter(
    (item) => item.section === 'main' && item.state !== 'leaving',
  ).length
  return (
    <button
      type="button"
      onClick={onExpand}
      data-testid={testIds.collapsedColumn}
      title={`Expand ${column}`}
      aria-label={`Expand ${column} column`}
      className="group bg-surface-1 border-border hover:bg-surface-2 flex w-11 shrink-0 flex-col items-center gap-3 rounded-md border py-3"
    >
      <ChevronsLeft
        size={16}
        className="text-ink-tertiary group-hover:text-ink-subtle shrink-0"
        aria-hidden
      />
      <span className="text-ink-tertiary bg-surface-3 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums">
        {liveCount}
      </span>
      <span className="text-ink-subtle text-[11px] font-medium tracking-[0.04em] uppercase [writing-mode:vertical-rl]">
        {column}
      </span>
    </button>
  )
}
