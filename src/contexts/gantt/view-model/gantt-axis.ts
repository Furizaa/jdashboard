import type { GanttOpenSpan, GanttSpan } from '../domain'

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
// Pure. No I/O, no clock, no framework: `today` is an argument everywhere it
// appears.

export type GanttZoom = 'week' | 'month' | 'quarter'

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
// a string again only for a tick key or a label. `Date` appears here and nowhere
// else, UTC throughout: a chart date is a calendar day, and letting a local
// timezone shift it would move a bar by a day for half the world.

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

export function toDay(date: string): number {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

function fromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

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
 * The chart's dated extent, **padded to whole units of the zoom**: whole weeks
 * at week zoom, whole months at month, whole quarters at quarter. A bar that
 * ends mid-week would otherwise leave the axis ending mid-label.
 *
 * A chart with nothing dated still gets an axis — the one unit containing today
 * — because the rows exist and the reader is going to look at them.
 */
export function axisFor(extent: GanttSpan | null, zoom: GanttZoom, anchor: number): GanttAxis {
  const from = extent === null ? anchor : toDay(extent.start)
  const to = extent === null ? anchor : toDay(extent.end)
  const [start, end] =
    zoom === 'week'
      ? [from - mondayOffset(from), to - mondayOffset(to) + DAYS_PER_WEEK - 1]
      : zoom === 'month'
        ? [startOfMonth(from), startOfNextMonth(to) - 1]
        : [startOfQuarter(from), startOfNextMonth(startOfQuarter(to), MONTHS_PER_QUARTER) - 1]
  return { start, end, days: end - start + 1 }
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
