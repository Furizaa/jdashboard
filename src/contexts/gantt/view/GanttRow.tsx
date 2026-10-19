import { ChevronDown, ChevronRight, FileText, Link2Off, TriangleAlert } from 'lucide-react'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { GanttNodeView } from '~/kernel'
import type { GanttBar as GanttBarGeometry, GanttChildSpanBar, GanttRow } from '../view-model'
import { GanttBar } from './GanttBar'
import { InfoBand } from './InfoBand'

// One lane: its tree cell on the left and its bar on the right, as a single flex
// row so the two halves cannot drift apart vertically.
//
// **The heights are constants rather than measurements**, and that is
// load-bearing: `GanttArrows` works out where a row sits by counting the rows
// above it, so a row whose height depended on its content would mean measuring
// the DOM to draw an arrow. That is why an open info band is a fixed height with
// its own scrollbar rather than a `max-height`.

export const ROW_HEIGHT = 36

/**
 * The tree column's width, and the same width as the inset the bar-region
 * overlays use. The two have to agree — gridlines and arrows are positioned in
 * fractions of the bar region, so an overlay that started anywhere else would
 * put every arrow a few pixels out.
 */
export const TREE_COLUMN_CLASS = 'w-80'
export const BAR_REGION_CLASS = 'left-80 right-0'

/** One depth step. Deep enough to read as nesting, shallow enough for five levels. */
const INDENT_PER_DEPTH = 14

export function GanttChartRow({
  row,
  node,
  chartId,
  bar,
  childSpan,
  onToggleCollapse,
  onToggleInfo,
}: {
  row: GanttRow
  node: GanttNodeView
  chartId: string
  bar: GanttBarGeometry | undefined
  childSpan: GanttChildSpanBar | undefined
  onToggleCollapse: () => void
  onToggleInfo: () => void
}) {
  return (
    <div
      data-testid={testIds.ganttRow}
      data-node-id={node.id}
      data-depth={row.depth}
      data-undated={row.undated}
      data-collapsed={row.collapsed}
      data-blocked={row.blocked}
    >
      {/* The border is *inside* the fixed height (border-box), so a row's outer
          height is exactly `ROW_HEIGHT` and the arrow overlay's offsets stay
          arithmetic rather than measured. */}
      <div className="border-border/40 flex border-b" style={{ height: ROW_HEIGHT }}>
        <div
          className={cn(
            'border-border/60 flex shrink-0 items-center gap-1 border-r pr-2 pl-2',
            TREE_COLUMN_CLASS,
            row.undated && 'opacity-55',
          )}
          style={{ paddingLeft: 8 + row.depth * INDENT_PER_DEPTH }}
        >
          <CollapseToggle row={row} onToggle={onToggleCollapse} />
          <LaneTitle node={node} />
          <LaneBadges row={row} node={node} />
          <InfoToggle node={node} open={row.infoExpanded} onToggle={onToggleInfo} />
        </div>
        <div className="relative min-w-0 flex-1">
          <GanttBar row={row} bar={bar} childSpan={childSpan} />
        </div>
      </div>
      {row.infoExpanded && <InfoBand chartId={chartId} node={node} depth={row.depth} />}
    </div>
  )
}

function CollapseToggle({ row, onToggle }: { row: GanttRow; onToggle: () => void }) {
  if (!row.hasChildren) {
    return <span className="inline-block w-4 shrink-0" aria-hidden />
  }
  const Icon = row.collapsed ? ChevronRight : ChevronDown
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!row.collapsed}
      aria-label={row.collapsed ? `Expand ${row.node.title}` : `Collapse ${row.node.title}`}
      className="text-ink-tertiary hover:text-foreground focus-visible:ring-ring inline-flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <Icon size={13} aria-hidden />
    </button>
  )
}

function LaneTitle({ node }: { node: GanttNodeView }) {
  return (
    <span className="min-w-0 flex-1 truncate text-xs" title={node.title}>
      {node.source.kind === 'jira' && (
        <span className="text-ink-tertiary mr-1.5 font-mono text-[10px] tracking-[0.03em]">
          {node.source.key}
        </span>
      )}
      <span className="text-foreground">{node.title}</span>
    </span>
  )
}

/**
 * The two facts a lane carries that its bar cannot: the real HDR status name,
 * which is not the column's name, and whether sync found the ticket had left the
 * epic. A departed ticket is **marked, not removed** (ADR-0012 §5), and this
 * badge is the marking.
 */
function LaneBadges({ row, node }: { row: GanttRow; node: GanttNodeView }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {node.orphaned && (
        <span
          title="This ticket left its epic. Sync marks it rather than removing it."
          className="text-amber-400"
        >
          <Link2Off size={12} aria-label="Orphaned" />
        </span>
      )}
      {row.blocked === 'unresolvable' && (
        <span title="In a dependency cycle" className="text-destructive">
          <TriangleAlert size={12} aria-label="In a cycle" />
        </span>
      )}
      {node.status !== null && (
        <span className="text-ink-tertiary max-w-24 truncate text-[10px]" title={node.status}>
          {node.status}
        </span>
      )}
      {node.assignee !== null && (
        <span className="text-ink-tertiary text-[10px]" title={node.assignee}>
          {initialsOf(node.assignee)}
        </span>
      )}
    </span>
  )
}

/** The band's affordance, present only on a lane that has a body to show. */
function InfoToggle({
  node,
  open,
  onToggle,
}: {
  node: GanttNodeView
  open: boolean
  onToggle: () => void
}) {
  if (!node.hasBody) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={testIds.ganttInfoToggle}
      data-node-id={node.id}
      aria-expanded={open}
      aria-label={
        open ? `Hide the document on ${node.title}` : `Read the document on ${node.title}`
      }
      title={open ? 'Hide document' : 'Read document'}
      className={cn(
        'focus-visible:ring-ring inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none',
        open
          ? 'text-foreground bg-surface-2'
          : 'text-ink-tertiary hover:text-foreground hover:bg-surface-2',
      )}
    >
      <FileText size={12} aria-hidden />
    </button>
  )
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u)
  return parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('')
}
