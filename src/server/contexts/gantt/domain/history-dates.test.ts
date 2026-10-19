import { describe, expect, it } from 'vitest'
import { spanFromHistory, utcDateOf, type StatusChange } from './history-dates'

// Pure and table-driven, like `reconcile.test.ts`: every row is one ticket's
// history and the span a reader should see for it. Plain `vitest` rather than
// `@effect/vitest` because nothing here is an Effect — which also means there is
// no `it.effect` trap to fall into.

const at = (date: string, to: string): StatusChange => ({ at: `${date}T10:00:00.000+0200`, to })

describe('spanFromHistory', () => {
  it.each([
    ['never started', [], { start: null, end: null }],
    [
      'never left TO DO',
      [at('2026-09-01', 'New'), at('2026-09-02', 'Reviewed'), at('2026-09-03', 'Blocked')],
      { start: null, end: null },
    ],
    [
      'started and finished',
      [at('2026-09-01', 'In Implementation'), at('2026-09-10', 'Done')],
      { start: '2026-09-01', end: '2026-09-10' },
    ],
    [
      'started, finished, reopened and finished again — the first Done wins',
      [
        at('2026-09-01', 'In Implementation'),
        at('2026-09-10', 'In QA'),
        at('2026-09-11', 'In Implementation'),
        at('2026-12-20', 'In QA'),
        at('2026-12-21', 'Done'),
      ],
      { start: '2026-09-01', end: '2026-09-10' },
    ],
    [
      'in flight: a start and no end at all',
      [at('2026-09-01', 'In Implementation'), at('2026-09-04', 'In Code Review')],
      { start: '2026-09-01', end: null },
    ],
    [
      'mixed casing in one history, as HDR really sends it',
      [
        at('2026-09-01', 'IN IMPLEMENTATION'),
        at('2026-09-04', 'In QA'),
        at('2026-09-09', 'IN UAT'),
      ],
      { start: '2026-09-01', end: '2026-09-04' },
    ],
    [
      'a status the column map does not know is TO DO, so it is not a start',
      [at('2026-09-01', 'Awaiting Triage'), at('2026-09-05', 'IN CODE REVIEW')],
      { start: '2026-09-05', end: null },
    ],
    [
      'straight to Done: one transition is both ends of the span',
      [at('2026-09-01', 'Done')],
      { start: '2026-09-01', end: '2026-09-01' },
    ],
    [
      'back to TO DO and out again — the first start wins, as the first Done does',
      [
        at('2026-09-01', 'In Implementation'),
        at('2026-09-02', 'Blocked'),
        at('2026-09-20', 'In Implementation'),
      ],
      { start: '2026-09-01', end: null },
    ],
    [
      'an unreadable timestamp is evidence of nothing and is skipped',
      [{ at: 'yesterday', to: 'In Implementation' }, at('2026-09-05', 'In Code Review')],
      { start: '2026-09-05', end: null },
    ],
  ] satisfies [string, StatusChange[], { start: string | null; end: string | null }][])(
    '%s',
    (_label, transitions, expected) => {
      expect(spanFromHistory(transitions)).toEqual(expected)
    },
  )

  // Stated as its own case because it is the rule the whole verb rests on: an
  // unfinished ticket gets an open-ended bar, not a bar that ends today.
  it('never substitutes a date for a missing end', () => {
    const span = spanFromHistory([at('2026-09-01', 'In Implementation')])
    expect(span.end).toBeNull()
  })
})

describe('utcDateOf', () => {
  it.each([
    ['2026-09-01T23:30:00.000+0200', '2026-09-01'],
    // 00:30 in Helsinki is still the previous day in UTC, and UTC is the axis.
    ['2026-09-02T00:30:00.000+0300', '2026-09-01'],
    ['2026-09-02T10:00:00.000Z', '2026-09-02'],
  ])('reads %s as %s', (instant, expected) => {
    expect(utcDateOf(instant)).toBe(expected)
  })

  it('is null for something that is not an instant', () => {
    expect(utcDateOf('not a date')).toBeNull()
  })
})
