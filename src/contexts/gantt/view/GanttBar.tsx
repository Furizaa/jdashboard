import { match } from 'ts-pattern'
import { COLUMNS, type Column } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import { styleForStatus } from '~/widgets/status-pill'
import type { GanttBar as GanttBarGeometry, GanttChildSpanBar, GanttRow } from '../view-model'
import { pct } from './GanttAxis'

// One lane's bar, and the derived underlay beneath it.
//
// A **parent** is segmented by the `Column` distribution of its leaf descendants
// and states "7 of 11 done" (ADR-0012 §4). A single rolled-up state was rejected
// outright: "In Implementation" over eleven features could be one started and
// ten untouched, or ten shipped and one in review, and those are different
// projects. A **leaf** is one solid bar in its own status's tone.
//
// The underlay is where the lane's dated descendants actually sit. It is drawn
// whether or not it exceeds the declared window, because "this PRD is Q4 and its
// features are Q4" is worth seeing — but an **overrun** is toned differently,
// since slip being visible rather than silently absorbed is the reason the
// derived span is drawn at all.
//
// **The colours are the status chips'.** `styleForStatus` is the ticket card's
// own palette, read rather than re-picked: a bar and the chip on the same
// ticket's card disagreeing about what colour `IN UAT` is would be two answers to
// one question. It is also the finer vocabulary — `Column` folds `In STG`,
// `In QA`, `In UAT` and `Done` into one tone and `Blocked` into `TO DO`'s grey,
// which is exactly the distinction a reader scanning a release wants back. The
// four it gives back are steps of **one green** rather than four hues; the
// palette says why.

/**
 * The bar's fill, as a translucent wash of the status chip's colour.
 *
 * Translucent rather than solid for the same reason the tones always were: the
 * gridlines and the today line have to read through a bar, and a parent's
 * segments have to stay distinguishable where they join. `99` is 60% as the two
 * hex digits CSS appends to a `#rrggbb`.
 */
const BAR_FILL_ALPHA = '99'

/**
 * A lane with no status of its own — every **local** lane, since `status` is
 * mirrored from Jira and an agent-authored lane has no ticket to mirror.
 *
 * Its declared `Column` is the only progress it has, so each column borrows the
 * chip colour of the status that best stands for it. Borrowing rather than
 * inventing a parallel set is the point: a local lane marked `Done` and a ticket
 * in `Done` must not be two different greens.
 */
const COLUMN_PROXY_STATUS: Readonly<Record<Column, string>> = {
  // `New` deliberately — HDR's own first status, and one the pill has no entry
  // for, so it lands on the palette's grey fallback. That is the right grey: a
  // `TO DO` lane nobody has picked up looks like a `New` ticket on the board,
  // which is what a reader is already used to it looking like. The column's two
  // real statuses would both be wrong here — `Reviewed` is yellow and `Blocked`
  // is red, and neither is what "no status at all" means.
  'TO DO': 'new',
  'In Implementation': 'in implementation',
  'In Code Review': 'in code review',
  Done: 'done',
}

/** The chip colour for a lane: its real status, or its column's stand-in. */
function toneOf(status: string | null, column: Column): string {
  return styleForStatus(status ?? COLUMN_PROXY_STATUS[column]).color
}

/**
 * Blocked and unresolvable are drawn as a **ring around the bar**, not as a
 * colour in it: the fill already means progress, and overloading it would make
 * "blocked" and "in review" compete for the same pixels. `unresolvable` — a lane
 * in a cycle — gets the dashed destructive outline the cycle's arrows get.
 *
 * The derived state keeps amber even though the Jira status named `Blocked` is
 * now red, and the two staying apart is deliberate: "somebody set this ticket to
 * Blocked" and "something in this chart is in front of it" are different facts,
 * and on a chart with fifty edges the second is common enough that painting it
 * red would make red mean nothing.
 */
function blockedRing(state: GanttRow['blocked']): string {
  return match(state)
    .with('none', () => 'ring-0')
    .with('blocked', () => 'ring-1 ring-amber-400/70')
    .with('unresolvable', () => 'ring-1 ring-destructive outline-destructive')
    .exhaustive()
}

/**
 * An open-ended bar is **unterminated**: it fades out towards its right edge
 * instead of stopping at one (ADR-0012 §4).
 *
 * The bar runs from a known start to today, and a hard edge there would read as
 * a bar that finishes today — a forecast nobody made, and precisely the
 * assertion that leaving `end` null was refusing to make. A mask rather than a
 * gradient fill, because it fades the ring, the segments and the tone together,
 * so the fade cannot disagree with whatever the bar is otherwise drawn as.
 *
 * The stop is a **proportion**, not a pixel distance: bar widths vary by more
 * than an order of magnitude across the three zooms, and a fixed feather that
 * reads at quarter zoom is invisible at week zoom.
 */
const OPEN_ENDED_FADE = 'mask-r-from-60% mask-r-to-100%'

export function GanttBar({
  row,
  bar,
  childSpan,
  dimmed,
  onSelect,
}: {
  row: GanttRow
  bar: GanttBarGeometry | undefined
  childSpan: GanttChildSpanBar | undefined
  /** Something else is selected, and this lane is not in its waterfall. */
  dimmed: boolean
  onSelect: () => void
}) {
  return (
    <>
      {childSpan !== undefined && <ChildSpanUnderlay span={childSpan} dimmed={dimmed} />}
      {bar === undefined ? (
        <NoBar undated={row.undated} />
      ) : (
        <Bar row={row} bar={bar} dimmed={dimmed} onSelect={onSelect} />
      )}
    </>
  )
}

function Bar({
  row,
  bar,
  dimmed,
  onSelect,
}: {
  row: GanttRow
  bar: GanttBarGeometry
  dimmed: boolean
  onSelect: () => void
}) {
  const label = `${row.progress.done} of ${row.progress.total} done`
  const named = row.hasChildren ? `${row.node.title} — ${label}` : row.node.title
  const tone = toneOf(row.node.status, row.node.column)
  return (
    // A **button**, because selecting a lane is what clicking its bar now does —
    // the chart's answer to a thicket of 54 arrows is to draw none of them until
    // a reader asks about one lane (ADR-0012 §10's amendment). The lane's *title*
    // still opens the ticket, so the two gestures stay on two targets.
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={row.selected}
      aria-label={`Show what ${row.node.title} depends on`}
      data-testid={testIds.ganttBar}
      data-node-id={row.node.id}
      data-blocked={row.blocked}
      data-segmented={row.hasChildren}
      data-open-ended={bar.openEnded}
      data-ghost={bar.ghost}
      data-selected={row.selected}
      title={titleFor(named, bar)}
      className={cn(
        'focus-visible:ring-ring absolute top-1.5 bottom-1.5 flex overflow-hidden rounded-[3px] transition-opacity focus-visible:ring-2 focus-visible:outline-none',
        blockedRing(row.blocked),
        row.blocked === 'unresolvable' && 'outline-1 outline-offset-1 outline-dashed',
        // A ghost is an outline with no fill — see `GHOST_BAR`.
        bar.ghost && GHOST_BAR,
        // The whole bar is masked, ring and segments included, so there is no
        // edge of any kind left on the right — see `OPEN_ENDED_FADE`.
        bar.openEnded && OPEN_ENDED_FADE,
        // Selection reads as *everything else receding*, not as the bar growing:
        // a chart where the lit lane changed size would reflow on every click.
        dimmed && 'opacity-25',
        row.selected && 'ring-primary ring-offset-background ring-2 ring-offset-1',
      )}
      style={{
        left: pct(bar.x),
        width: pct(bar.width),
        ...(bar.ghost
          ? { borderColor: tone }
          : row.hasChildren
            ? {}
            : { backgroundColor: `${tone}${BAR_FILL_ALPHA}` }),
      }}
    >
      {row.hasChildren && <Segments row={row} />}
      {row.hasChildren && <ProgressLabel label={label} />}
    </button>
  )
}

/**
 * **The invented bar.** A dashed outline with no fill, for a lane nobody dated
 * (ADR-0012 §4's amendment (ii)).
 *
 * ADR-0012 §4 refused to draw an undated lane at all, on the grounds that a bar
 * is a plan and the chart must not fabricate one. The first real chart showed
 * what that costs: the `TO DO` and blocked lanes — the ones a reader opens a
 * Gantt to find — were exactly the blank ones, so the chart could not answer
 * "what do I work on next" at all. The resolution is not to relax the rule but
 * to draw something that is visibly **not a plan**: no fill, a dashed border in
 * the status's own colour, and a tooltip that says "no dates". Nobody reads this
 * as a date somebody set, which is the whole licence for drawing it.
 */
const GHOST_BAR = 'border border-dashed bg-transparent'

function titleFor(named: string, bar: GanttBarGeometry): string {
  if (bar.openEnded) return `${named} — in flight, no forecast end`
  if (!bar.ghost) return named
  return bar.afterBlocker === null
    ? `${named} — no dates; shown as a week from today`
    : `${named} — no dates; shown as a week after ${bar.afterBlocker}`
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
 *
 * Segments stay keyed by **`Column`** while a leaf bar is keyed by status, and
 * that asymmetry is deliberate. The rollup is a Column fact — it is what "7 of 11
 * done" counts — and splitting a PRD over eleven features into eight status
 * segments would make a thin rainbow of the one bar whose job is to be read at a
 * glance. The column borrows its chip colour from `COLUMN_PROXY_STATUS`, so the
 * two vocabularies at least agree about what green means.
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
          className="h-full"
          style={{
            width: pct(distribution[column] / total),
            backgroundColor: `${toneOf(null, column)}${BAR_FILL_ALPHA}`,
          }}
        />
      ))}
    </>
  )
}

function ChildSpanUnderlay({ span, dimmed }: { span: GanttChildSpanBar; dimmed: boolean }) {
  return (
    <div
      data-testid={testIds.ganttChildSpan}
      data-node-id={span.nodeId}
      data-overflow={span.overflow}
      title={span.overflow ? 'Children run outside this lane’s declared window' : 'Children'}
      className={cn(
        'absolute bottom-0.5 h-1 rounded-full transition-opacity',
        span.overflow ? 'bg-amber-400/80' : 'bg-ink-tertiary/60',
        dimmed && 'opacity-25',
      )}
      style={{ left: pct(span.x), width: pct(span.width) }}
    />
  )
}

/**
 * A lane with no bar at all, which after the ghost amendment means exactly one
 * thing: an undated **parent**.
 *
 * A parent is left out of the ghosting on purpose — its child-span underlay
 * already answers "when", and a ghost over the top of that would be the chart
 * arguing with itself (`domain/ghost-span.ts`). So the label stays for the case
 * it was written for: saying "no dates yet" rather than leaving the reader to
 * wonder where the bar went.
 */
function NoBar({ undated }: { undated: boolean }) {
  if (!undated) return null
  return (
    <span className="text-ink-tertiary absolute top-1/2 left-2 -translate-y-1/2 text-[10px] italic">
      no dates
    </span>
  )
}
