import { match } from 'ts-pattern'
import { COLUMNS, type Column } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { GanttBar as GanttBarGeometry, GanttChildSpanBar, GanttRow } from '../view-model'
import { pct } from './GanttAxis'

// One lane's bar, and the derived underlay beneath it.
//
// A **parent** is segmented by the `Column` distribution of its leaf descendants
// and states "7 of 11 done" (ADR-0012 §4). A single rolled-up state was rejected
// outright: "In Implementation" over eleven features could be one started and
// ten untouched, or ten shipped and one in review, and those are different
// projects. A **leaf** is one solid bar in its own column's tone.
//
// The underlay is where the lane's dated descendants actually sit. It is drawn
// whether or not it exceeds the declared window, because "this PRD is Q4 and its
// features are Q4" is worth seeing — but an **overrun** is toned differently,
// since slip being visible rather than silently absorbed is the reason the
// derived span is drawn at all.

/** The bar's tone per column. Progress is the kernel vocabulary, so this is too. */
function columnTone(column: Column): string {
  return match(column)
    .with('TO DO', () => 'bg-slate-500/55')
    .with('In Implementation', () => 'bg-sky-500/60')
    .with('In Code Review', () => 'bg-amber-500/60')
    .with('Done', () => 'bg-emerald-500/60')
    .exhaustive()
}

/**
 * Blocked and unresolvable are drawn as a **ring around the bar**, not as a
 * colour in it: the fill already means progress, and overloading it would make
 * "blocked" and "in review" compete for the same pixels. `unresolvable` — a lane
 * in a cycle — gets the dashed destructive outline the cycle's arrows get.
 */
function blockedRing(state: GanttRow['blocked']): string {
  return match(state)
    .with('none', () => 'ring-0')
    .with('blocked', () => 'ring-1 ring-amber-400/70')
    .with('unresolvable', () => 'ring-1 ring-destructive outline-destructive')
    .exhaustive()
}

export function GanttBar({
  row,
  bar,
  childSpan,
}: {
  row: GanttRow
  bar: GanttBarGeometry | undefined
  childSpan: GanttChildSpanBar | undefined
}) {
  return (
    <>
      {childSpan !== undefined && <ChildSpanUnderlay span={childSpan} />}
      {bar === undefined ? <NoBar undated={row.undated} /> : <Bar row={row} bar={bar} />}
    </>
  )
}

function Bar({ row, bar }: { row: GanttRow; bar: GanttBarGeometry }) {
  const label = `${row.progress.done} of ${row.progress.total} done`
  return (
    <div
      data-testid={testIds.ganttBar}
      data-node-id={row.node.id}
      data-blocked={row.blocked}
      data-segmented={row.hasChildren}
      title={row.hasChildren ? `${row.node.title} — ${label}` : row.node.title}
      className={cn(
        'absolute top-1.5 bottom-1.5 flex overflow-hidden rounded-[3px]',
        blockedRing(row.blocked),
        row.blocked === 'unresolvable' && 'outline-1 outline-offset-1 outline-dashed',
        !row.hasChildren && columnTone(row.node.column),
      )}
      style={{ left: pct(bar.x), width: pct(bar.width) }}
    >
      {row.hasChildren && <Segments row={row} />}
      {row.hasChildren && <ProgressLabel label={label} />}
    </div>
  )
}

/**
 * `n of m done`, on a backdrop rather than straight on the bar.
 *
 * The backdrop fixes a real defect, and it is two collisions rather than one.
 * Every bar tone is translucent, so a **crossing arrow** — the red dashed cycle
 * edge in particular — shows through the bar and runs horizontally through the
 * text. And a parent's bar is **segmented**, so the label frequently straddles a
 * colour boundary and loses half its contrast at the join. A near-opaque chip
 * under the text answers both at once, and keeps the distribution the label is
 * reporting visible either side of it.
 */
function ProgressLabel({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-1">
      <span className="text-foreground bg-background/85 truncate rounded-[2px] px-1 py-px text-[10px] leading-none font-medium tabular-nums">
        {label}
      </span>
    </span>
  )
}

/**
 * The distribution as widths. Empty columns contribute no segment at all rather
 * than a zero-width one, so a bar of two tones is two elements.
 */
function Segments({ row }: { row: GanttRow }) {
  const { distribution, total } = row.progress
  if (total === 0) return null
  return (
    <>
      {COLUMNS.filter((column) => distribution[column] > 0).map((column) => (
        <span
          key={column}
          data-column={column}
          title={`${distribution[column]} ${column}`}
          className={cn('h-full', columnTone(column))}
          style={{ width: pct(distribution[column] / total) }}
        />
      ))}
    </>
  )
}

function ChildSpanUnderlay({ span }: { span: GanttChildSpanBar }) {
  return (
    <div
      data-testid={testIds.ganttChildSpan}
      data-node-id={span.nodeId}
      data-overflow={span.overflow}
      title={span.overflow ? 'Children run outside this lane’s declared window' : 'Children'}
      className={cn(
        'absolute bottom-0.5 h-1 rounded-full',
        span.overflow ? 'bg-amber-400/80' : 'bg-ink-tertiary/60',
      )}
      style={{ left: pct(span.x), width: pct(span.width) }}
    />
  )
}

/**
 * A lane with no bar. Dates are nullable because import makes them so (ADR-0012
 * §4), so this is an ordinary state and not a defect — it says "no dates yet"
 * rather than leaving the reader to wonder where the bar went.
 */
function NoBar({ undated }: { undated: boolean }) {
  if (!undated) return null
  return (
    <span className="text-ink-tertiary absolute top-1/2 left-2 -translate-y-1/2 text-[10px] italic">
      no dates
    </span>
  )
}
