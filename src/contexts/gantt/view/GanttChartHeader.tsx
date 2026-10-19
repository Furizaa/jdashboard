import { ChevronLeft, FoldVertical, RefreshCw, UnfoldVertical } from 'lucide-react'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { GanttChartApi } from '../presenter'
import { ChangelogPopover } from './ChangelogPopover'
import { CopySkillButton } from './CopySkillButton'
import { NeedsAttention } from './NeedsAttention'
import { ZoomControls } from './ZoomControls'

// The chart's own header strip: where it is, what needs attention, and the five
// controls a reader has over it.
//
// Its own file because `GanttChartView.tsx` sits at the repo's fifteen-import
// ceiling, and the header is the half of it that pulls in the other components.
// The split is along the obvious seam — the frame draws rows, bars and arrows;
// the header draws none of them.
//
// **Nothing here writes to the plan.** Copy SKILL hands an agent its brief and
// Refresh refreshes the mirrored half Jira owns; the other three are the
// reader's own view state (ADR-0012 §8).

type ReadyApi = Extract<GanttChartApi, { phase: 'ready' }>

export function ChartHeader({ api, onBack }: { api: ReadyApi; onBack: () => void }) {
  return (
    <div className="border-border flex h-11 shrink-0 items-center gap-3 border-b px-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the chart list"
        className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring -ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <ChevronLeft size={13} aria-hidden />
        <span>Charts</span>
      </button>
      <span className="text-foreground truncate text-[13px] font-medium tracking-[-0.01em]">
        {api.chart.title}
      </span>
      <NeedsAttention needs={api.layout.needsAttention} />
      <div className="ml-auto flex items-center gap-2">
        <CopySkillButton chartId={api.chartId} />
        <RefreshButton api={api} />
        <FoldButton api={api} />
        <ZoomControls zoom={api.zoom} onZoom={api.setZoom} />
        <ChangelogPopover chartId={api.chartId} />
      </div>
    </div>
  )
}

/**
 * The only control on this surface that reaches Jira — and still not a write to
 * the plan: sync refreshes the mirrored half and marks departures, and never
 * moves or removes a lane (ADR-0012 §5).
 *
 * Absent entirely on a chart with no epics behind it. A button whose only effect
 * would be a changelog entry saying nothing happened is worse than no button.
 */
function RefreshButton({ api }: { api: ReadyApi }) {
  if (!api.canSync) return null
  return (
    <button
      type="button"
      onClick={api.refresh}
      disabled={api.isSyncing}
      data-testid={testIds.ganttSync}
      aria-label="Refresh from Jira"
      title={api.isSyncing ? 'Refreshing from Jira…' : 'Refresh from Jira'}
      className="border-border text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
    >
      <RefreshCw size={13} className={cn(api.isSyncing && 'animate-spin')} aria-hidden />
    </button>
  )
}

/**
 * One button rather than two. A fully collapsed chart is a PRD-level dependency
 * graph — arguably the most useful view of all (ADR-0012 §10) — and it is worth
 * arriving at and leaving again in one place.
 */
function FoldButton({ api }: { api: ReadyApi }) {
  const Icon = api.allCollapsed ? UnfoldVertical : FoldVertical
  const label = api.allCollapsed ? 'Expand all lanes' : 'Collapse all lanes'
  return (
    <button
      type="button"
      onClick={api.allCollapsed ? api.expandAll : api.collapseAll}
      aria-label={label}
      title={label}
      className="border-border text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <Icon size={13} aria-hidden />
    </button>
  )
}
