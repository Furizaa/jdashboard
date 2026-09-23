import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import { MR_PRIORITY_LABEL, type MrPriority } from '~/kernel'

const PRIORITY_CHIP_CLASS: Record<MrPriority, string> = {
  hotfix: 'border-rose-500/50 bg-rose-500/15 text-rose-500 font-semibold',
  high: 'border-amber-500/50 bg-amber-500/15 text-amber-500',
  normal: 'border-border text-ink-subtle',
  low: 'border-border text-ink-subtle opacity-70',
}

export function MrPriorityBadge({ priority }: { priority: MrPriority }) {
  return (
    <span
      data-testid={testIds.mrPriorityBadge}
      data-priority={priority}
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none font-medium',
        PRIORITY_CHIP_CLASS[priority],
      )}
    >
      {MR_PRIORITY_LABEL[priority]}
    </span>
  )
}
