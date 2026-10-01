import { AlertTriangle, CircleCheckBig, Loader2, Unplug, X } from 'lucide-react'
import { match } from 'ts-pattern'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { ExplainTabDisplay } from '../view-model'

/** One tab in the strip: the MR it reviews, its phase, and its close control. */
export function ExplainTab({
  tab,
  onSelect,
  onClose,
}: {
  tab: ExplainTabDisplay
  onSelect: () => void
  onClose: () => void
}) {
  return (
    <div
      data-testid={testIds.explainTab}
      data-iid={tab.iid}
      data-phase={tab.phase}
      data-selected={tab.isSelected}
      className={cn(
        'group border-border flex h-9 shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 pr-1 pl-2.5 text-xs transition-colors',
        tab.isSelected
          ? 'bg-surface-2 text-foreground'
          : 'bg-surface-1 text-ink-subtle hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={tab.title}
        className="focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded focus-visible:ring-2 focus-visible:outline-none"
      >
        <PhaseIcon tab={tab} />
        <span className="max-w-40 truncate font-medium">{tab.label}</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close review of ${tab.label}`}
        data-testid={testIds.explainTabClose}
        data-iid={tab.iid}
        className="text-ink-tertiary hover:text-foreground hover:bg-surface-3 focus-visible:ring-ring inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <X size={11} />
      </button>
    </div>
  )
}

function PhaseIcon({ tab }: { tab: ExplainTabDisplay }) {
  return match(tab.phase)
    .with('preparing', 'running', () => (
      <Loader2 size={11} className="shrink-0 animate-spin text-blue-400" aria-hidden />
    ))
    .with('report', () => (
      <CircleCheckBig size={11} className="text-ink-tertiary shrink-0" aria-hidden />
    ))
    .with('failed', () => (
      <AlertTriangle size={11} className="text-destructive shrink-0" aria-hidden />
    ))
    .with('interrupted', () => <Unplug size={11} className="shrink-0 text-amber-400" aria-hidden />)
    .exhaustive()
}
