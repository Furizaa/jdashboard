import { columnForStatus } from '~/kernel/columns'

// Where a date comes from, for work that has already happened.
//
// ADR-0012 §4(c) rejected "spans from observed status history" on the grounds
// that it "answers where the time went, not where the project is going". That
// rejection held for the **forecast** and failed for the **record**: a chart of
// mostly-finished work has no other truthful source, and the first real chart
// arrived with twenty-four started lanes and `start: null, end: null` on every
// one of them. The amendment is recorded in ADR-0012 §4 and it is scoped —
// history seeds blanks, it never overwrites, and it never invents an end for
// work still in flight.
//
// Pure, and deliberately ignorant of Jira: the caller hands it transitions it
// got from somewhere, in the shape below. `domain/reconcile.ts` keeps the same
// boundary for the same reason — a bounded context's domain does not name a
// gateway's types.

/**
 * One status transition, reduced to the two fields a span is computed from.
 * Structurally satisfied by the gateway's `StatusTransition`, which also carries
 * the status it came *from* — irrelevant here, because what makes a date is
 * where a ticket arrived.
 */
export type StatusChange = {
  /** The transition instant, as Jira writes it: ISO-8601, possibly with an offset. */
  readonly at: string
  /** The status name it moved into. Compared through `columnForStatus`. */
  readonly to: string
}

/** The chart-owned half of a node, as history can speak to it. */
export type HistorySpan = {
  readonly start: string | null
  readonly end: string | null
}

export const NO_SPAN: HistorySpan = { start: null, end: null }

/**
 * The UTC calendar date of an instant, `YYYY-MM-DD`.
 *
 * UTC rather than the instance's timezone: a chart's axis is dates, the
 * transition is an instant, and converting it in the reader's zone would make
 * the same ticket start on different days for two readers. `null` for an
 * instant that cannot be parsed, which the caller skips — a transition with an
 * unreadable timestamp is evidence of nothing.
 */
export function utcDateOf(instant: string): string | null {
  const ms = Date.parse(instant)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The span one ticket's history implies, from transitions **oldest first** —
 * which is the gateway's contract, not an assumption about Jira's ordering.
 *
 * - `start` is the date of the **first** transition into a status whose column
 *   is not `'TO DO'`. Work began when it stopped being to-do.
 * - `end` is the date of the **first** transition into a `'Done'` column status.
 *   First, not last: a ticket that bounced out of QA and back in again was
 *   finished the first time by any reading a reader cares about, and "last"
 *   would make a reopened ticket look like it took months.
 * - Still in flight → `end: null`, and **never today**. A forecast is the
 *   agent's job and the view draws an open-ended bar; inventing an end here
 *   would be asserting a forecast nobody made.
 * - Never started → both `null`.
 *
 * Every status comparison goes through `columnForStatus`, which is already
 * case-insensitive and already maps the unknown to `'TO DO'`. Both matter on the
 * chart this exists for: it carries `IN CODE REVIEW`, `IN IMPLEMENTATION`,
 * `In QA`, `IN UAT` and `New` in one dataset — mixed casing, and one status the
 * column map has never heard of.
 */
export function spanFromHistory(transitions: readonly StatusChange[]): HistorySpan {
  let start: string | null = null
  let end: string | null = null
  for (const transition of transitions) {
    const column = columnForStatus(transition.to)
    if (column === 'TO DO') continue
    const date = utcDateOf(transition.at)
    if (date === null) continue
    start ??= date
    if (column === 'Done') {
      end ??= date
      // The first Done is the answer, and nothing later can change either
      // field: `start` is already set by this same transition at the latest.
      break
    }
  }
  return { start, end }
}
