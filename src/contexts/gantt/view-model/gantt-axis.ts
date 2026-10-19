import { fromDay, toDay, type GanttOpenSpan, type GanttSpan } from '../domain'

// The time dimension: the axis domain the chart's dated extent is padded out to,
// the ticks along it, and where a span sits on it.
//
// Split from `gantt-layout.ts` because it is the *other* dimension — that file
// answers "which lanes, in what order", this one answers "over what stretch of
// time, labelled how" — and because every date in the application turning into a
// number happens here and nowhere else.
//
// **Positions are fractions of the axis, not pixels.** `x: 0.25, width: 0.1`
// means a quarter of the way along and a tenth of it wide, which the view turns
// into `left: 25%; width: 10%`. The alternative — taking a measured pixel width
// as an argument — would make every layout fact depend on a ResizeObserver, so
// the tests would need one and a resize would recompute the tree.
//
// The one pixel number here is `axisWidthOf`, and it is the *other* direction:
// not a measurement taken from the DOM but a width handed **to** it, so the bar
// region can be wider than the viewport and scroll. Fractions then resolve
// against that element instead of against the window, and every position above
// stays exactly as true as it was.
//
// Pure. No I/O, no clock, no framework: `today` is an argument everywhere it
// appears.

export type GanttZoom = 'week' | 'month' | 'quarter'

// Re-exported rather than re-implemented: the axis is still where the rest of
// the view-model reaches for a day number, and `domain/day.ts` is where it is
// defined once.
export { toDay } from '../domain'

export type GanttTick = {
  /** The `YYYY-MM-DD` the tick starts at; stable across re-renders. */
  readonly key: string
  /** `Mon 13` at week zoom, `W42` at month, `Oct` at quarter. */
  readonly label: string
  readonly x: number
  readonly width: number
}

// ---------------------------------------------------------------------------
// Dates, as whole days since the epoch
// ---------------------------------------------------------------------------
//
// Everything on the axis is day arithmetic, so a date becomes a number once and
// a string again only for a tick key or a label. `toDay` / `fromDay` are
// `domain/day.ts` — they moved there when ghost spans needed to *add* days, and
// two copies of an epoch conversion is the one duplication that cannot be
// allowed to drift. UTC throughout, here and there: a chart date is a calendar
// day, and letting a local timezone shift it would move a bar by a day for half
// the world. What is left below is axis-specific calendar maths.

const MS_PER_DAY = 86_400_000
const DAYS_PER_WEEK = 7
const MONTHS_PER_QUARTER = 3

/** Sunday-first weekday names, indexed by `weekdayOf`. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** 0 = Sunday. Epoch day 0 was a Thursday, hence the `+ 4`. */
function weekdayOf(day: number): number {
  return (((day + 4) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK
}

/** Days since the Monday of this day's week, so `day - mondayOffset` is that Monday. */
function mondayOffset(day: number): number {
  return (weekdayOf(day) + 6) % DAYS_PER_WEEK
}

function startOfMonth(day: number): number {
  const date = new Date(day * MS_PER_DAY)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / MS_PER_DAY
}

function startOfNextMonth(day: number, months = 1): number {
  const date = new Date(day * MS_PER_DAY)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1) / MS_PER_DAY
}

function startOfQuarter(day: number): number {
  const date = new Date(day * MS_PER_DAY)
  const month = date.getUTCMonth()
  return Date.UTC(date.getUTCFullYear(), month - (month % MONTHS_PER_QUARTER), 1) / MS_PER_DAY
}

/**
 * The ISO-8601 week number: the week owning the Thursday decides the year, which
 * is why a tick in early January can read `W52`. Honest rather than tidy — it is
 * the number the team's sprint is named after.
 */
function isoWeekOf(day: number): number {
  const thursday = day - mondayOffset(day) + 3
  const year = new Date(thursday * MS_PER_DAY).getUTCFullYear()
  const startOfIsoYear = toDay(`${year}-01-01`)
  return Math.floor((thursday - startOfIsoYear) / DAYS_PER_WEEK) + 1
}

// ---------------------------------------------------------------------------
// The axis
// ---------------------------------------------------------------------------

export type GanttAxis = {
  readonly start: number
  readonly end: number
  /** Inclusive day count — the denominator every fraction on the chart divides by. */
  readonly days: number
}

/**
 * How many pixels one day is worth at each zoom — and therefore how wide the bar
 * region is, which is what makes zoom change *density* rather than only tick
 * labels.
 *
 * Before this, the axis was always exactly as wide as the container: a chart
 * holding one fourteen-week lane squeezed its other thirty lanes into a few
 * pixels each and all three zooms drew the same unreadable picture. Fixing that
 * means the axis has an intrinsic width and the chart scrolls horizontally.
 *
 * The three numbers are the narrowest at which each zoom's own tick stays
 * legible: a `Mon 13` daily label, a `W42` over seven days, a month name over
 * thirty. Picking them from the labels rather than from a target total width is
 * the same discipline as the three fixed zooms themselves (ADR-0012 §10) — a
 * number per level that can be read and argued with, not a density heuristic.
 */
export const DAY_WIDTH: Readonly<Record<GanttZoom, number>> = {
  week: 36,
  month: 12,
  quarter: 4,
}

/**
 * How much empty calendar to leave on each side of the plan, in **whole units of
 * the zoom**.
 *
 * A chart that ends exactly where its last bar ends reads as a chart that has
 * run out of room, and there is nowhere to scroll to look at the week after the
 * programme finishes. One unit of padding is the smallest amount that says "time
 * carries on past here" and the largest that does not make a short chart mostly
 * empty.
 */
const PAD_UNITS = 1

/**
 * The chart's dated extent, **padded to whole units of the zoom** and then by
 * one further unit on each side: whole weeks at week zoom, whole months at
 * month, whole quarters at quarter. A bar that ends mid-week would otherwise
 * leave the axis ending mid-label, and a plan ending at the axis edge leaves the
 * reader nothing to scroll into.
 *
 * A chart with nothing dated still gets an axis — the unit containing today,
 * padded the same way — because the rows exist and the reader is going to look
 * at them.
 */
export function axisFor(extent: GanttSpan | null, zoom: GanttZoom, anchor: number): GanttAxis {
  const from = extent === null ? anchor : toDay(extent.start)
  const to = extent === null ? anchor : toDay(extent.end)
  const [start, end] =
    zoom === 'week'
      ? [
          from - mondayOffset(from) - PAD_UNITS * DAYS_PER_WEEK,
          to - mondayOffset(to) + (PAD_UNITS + 1) * DAYS_PER_WEEK - 1,
        ]
      : zoom === 'month'
        ? [
            startOfNextMonth(startOfMonth(from), -PAD_UNITS),
            startOfNextMonth(to, PAD_UNITS + 1) - 1,
          ]
        : [
            startOfNextMonth(startOfQuarter(from), -PAD_UNITS * MONTHS_PER_QUARTER),
            startOfNextMonth(startOfQuarter(to), (PAD_UNITS + 1) * MONTHS_PER_QUARTER) - 1,
          ]
  return { start, end, days: end - start + 1 }
}

/**
 * The bar region's width in pixels — the one number the view is *given* rather
 * than measures, and the thing the horizontal scroll is sized by.
 *
 * Every other position on the chart stays a fraction, so this element is the
 * only place pixels and days meet.
 */
export function axisWidthOf(axis: GanttAxis, zoom: GanttZoom): number {
  return Math.round(axis.days * DAY_WIDTH[zoom])
}

/** The last day of the tick that starts on `day`, clipped to the axis. */
function tickEnd(day: number, zoom: GanttZoom, axis: GanttAxis): number {
  const natural =
    zoom === 'week'
      ? day
      : zoom === 'month'
        ? day + DAYS_PER_WEEK - 1 - mondayOffset(day)
        : startOfNextMonth(day) - 1
  return Math.min(natural, axis.end)
}

function tickLabel(day: number, zoom: GanttZoom): string {
  const date = new Date(day * MS_PER_DAY)
  if (zoom === 'week') return `${WEEKDAYS[weekdayOf(day)] ?? ''} ${date.getUTCDate()}`
  if (zoom === 'month') return `W${isoWeekOf(day)}`
  return MONTHS[date.getUTCMonth()] ?? ''
}

/**
 * One tick per day at week zoom, per ISO week at month zoom, per month at
 * quarter zoom — three vocabularies rather than one algorithm that picks a
 * density, because continuous zoom's tick-density heuristic is the fiddliest
 * code in any timeline and the hardest to make look deliberate at every scale.
 */
export function ticksFor(axis: GanttAxis, zoom: GanttZoom): readonly GanttTick[] {
  const ticks: GanttTick[] = []
  for (let day = axis.start; day <= axis.end; ) {
    const last = tickEnd(day, zoom, axis)
    ticks.push({
      key: fromDay(day),
      label: tickLabel(day, zoom),
      x: (day - axis.start) / axis.days,
      width: (last - day + 1) / axis.days,
    })
    day = last + 1
  }
  return ticks
}

/** A span as a fraction of the axis. The end date is inclusive, hence the `+ 1`. */
export function place(
  span: GanttSpan,
  axis: GanttAxis,
): { readonly x: number; readonly width: number } {
  const start = toDay(span.start)
  const end = toDay(span.end)
  return { x: (start - axis.start) / axis.days, width: (end - start + 1) / axis.days }
}

/**
 * An open-ended span as a fraction of the axis: from its start to **today**,
 * clipped into the axis.
 *
 * Today is where the bar *stops being drawn*, not where the work is forecast to
 * finish — nobody forecast anything, which is why `GanttOpenSpan.end` is `null`.
 * The view is what keeps the two apart: it fades the right edge out rather than
 * terminating it, so the bar states how long the work has been running without
 * asserting that it ends now.
 *
 * Two clamps, both of which a real chart reaches:
 *
 * - **Today before the start** — a lane dated into the future with no forecast
 *   end. One day wide at its start, rather than a negative width.
 * - **Today past the axis end** — the domain is padded from the plan's own
 *   extent, so a chart whose only lane began months ago ends before now. The bar
 *   runs to the last day there is, and the today line is already absent.
 */
export function placeOpen(
  span: GanttOpenSpan,
  axis: GanttAxis,
  today: number,
): { readonly x: number; readonly width: number } {
  const start = toDay(span.start)
  const end = Math.min(Math.max(today, start), axis.end)
  return { x: (start - axis.start) / axis.days, width: (end - start + 1) / axis.days }
}
