// A `YYYY-MM-DD` as a whole number of days since the epoch, and back again.
//
// Extracted from `view-model/gantt-axis.ts`, which used to carry the comment
// "`Date` appears here and nowhere else" and owned both directions on its own.
// That held for exactly as long as the only thing converting a date to a number
// was the axis. Ghost spans (`ghost-span.ts`) need to *add* days, which is day
// arithmetic in the domain, and two copies of an epoch conversion is the one
// duplication that cannot be allowed to drift: a half-day disagreement moves
// every bar on the chart.
//
// UTC throughout, for the same reason the axis was: a chart date is a calendar
// day, and letting a local timezone shift it would move a bar by a day for half
// the world.
//
// Pure. No I/O, no clock, no framework — `today` is an argument everywhere it
// appears.

const MS_PER_DAY = 86_400_000

/** `'2026-10-19'` → the count of whole days since 1970-01-01, UTC. */
export function toDay(date: string): number {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

/** The inverse of `toDay`. */
export function fromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

/** `date` shifted by `days`, as a `YYYY-MM-DD`. Negative shifts backwards. */
export function addDays(date: string, days: number): string {
  return fromDay(toDay(date) + days)
}
