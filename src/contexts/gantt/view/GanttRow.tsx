import { useEffect, useRef } from 'react'
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

/**
 * The same 320px as `TREE_COLUMN_CLASS`, as a number.
 *
 * Needed because the tree column is now `position: sticky` inside a horizontally
 * scrolling chart, and the scroll container has to know how much of its width
 * the tree takes before the axis gets the rest.
 */
export const TREE_COLUMN_WIDTH = 320

/** One depth step. Deep enough to read as nesting, shallow enough for five levels. */
const INDENT_PER_DEPTH = 14

export function GanttChartRow({
  row,
  node,
  chartId,
  bar,
  childSpan,
  revealed,
  dimmed,
  onToggleCollapse,
  onToggleInfo,
  onToggleSelection,
  onOpenIssue,
}: {
  row: GanttRow
  node: GanttNodeView
  chartId: string
  bar: GanttBarGeometry | undefined
  childSpan: GanttChildSpanBar | undefined
  /** This is the lane a `?node=` hand-off pointed at — scroll to it and flash it. */
  revealed: boolean
  /** Some other lane's waterfall is on screen and this lane is not part of it. */
  dimmed: boolean
  onToggleCollapse: () => void
  onToggleInfo: () => void
  onToggleSelection: () => void
  onOpenIssue: (issueKey: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // The same one-line effect the palette's lists use to keep the active row on
  // screen. `block: 'center'` rather than `'nearest'`: a hand-off from somewhere
  // else should land the lane where the eye already is, not just barely inside
  // the viewport.
  useEffect(() => {
    if (revealed) ref.current?.scrollIntoView({ block: 'center' })
  }, [revealed])

  return (
    <div
      ref={ref}
      data-testid={testIds.ganttRow}
      data-node-id={node.id}
      data-depth={row.depth}
      data-undated={row.undated}
      data-collapsed={row.collapsed}
      data-blocked={row.blocked}
      data-selected={row.selected}
      // The flash itself is one keyframe in `globals.css`, keyed off this
      // attribute exactly as the board's changed-card pulse is — so it is one
      // animation with one reduced-motion guard rather than inline style.
      data-revealed={revealed ? 'true' : undefined}
    >
      {/* The border is *inside* the fixed height (border-box), so a row's outer
          height is exactly `ROW_HEIGHT` and the arrow overlay's offsets stay
          arithmetic rather than measured. */}
      <div className="border-border/40 flex border-b" style={{ height: ROW_HEIGHT }}>
        {/* `sticky left-0` keeps the tree column in place while the time axis
            scrolls sideways under it, and the background is explicit because a
            transparent sticky cell would let the bars slide through it. */}
        <div
          className={cn(
            'border-border/60 bg-background sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r pr-2 pl-2 transition-opacity',
            TREE_COLUMN_CLASS,
            row.undated && 'opacity-55',
            dimmed && 'opacity-40',
            row.selected && 'bg-surface-2',
          )}
          style={{ paddingLeft: 8 + row.depth * INDENT_PER_DEPTH }}
        >
          <CollapseToggle row={row} onToggle={onToggleCollapse} />
          <LaneTitle node={node} onOpenIssue={onOpenIssue} />
          <LaneBadges row={row} node={node} />
          <InfoToggle node={node} open={row.infoExpanded} onToggle={onToggleInfo} />
        </div>
        <div className="relative min-w-0 flex-1">
          <GanttBar
            row={row}
            bar={bar}
            childSpan={childSpan}
            dimmed={dimmed}
            onSelect={onToggleSelection}
          />
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

/**
 * A lane's key and title. A **jira** lane is a button: clicking it opens the
 * real ticket reader over the chart — ADF, comments, relationships, transitions
 * — because that is already the best ticket reader in the app and ADR-0012 §10
 * gives the ticket panel the overlay while the lane's own document gets the
 * inline band. A **local** lane has no ticket to open, so it stays plain text
 * rather than becoming a button that would do nothing.
 */
function LaneTitle({
  node,
  onOpenIssue,
}: {
  node: GanttNodeView
  onOpenIssue: (issueKey: string) => void
}) {
  const source = node.source
  if (source.kind !== 'jira') {
    return (
      <span className="text-foreground min-w-0 flex-1 truncate text-xs" title={node.title}>
        {node.title}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onOpenIssue(source.key)}
      data-testid={testIds.ganttJiraLane}
      data-issue-key={source.key}
      title={`${source.key} — ${node.title}`}
      className="focus-visible:ring-ring min-w-0 flex-1 truncate rounded text-left text-xs focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="text-ink-tertiary mr-1.5 font-mono text-[10px] tracking-[0.03em]">
        {source.key}
      </span>
      <span className="text-foreground hover:underline">{node.title}</span>
    </button>
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
