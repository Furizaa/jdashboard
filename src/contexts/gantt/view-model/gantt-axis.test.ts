import { describe, expect, it } from 'vitest'
import { axisFor, axisWidthOf, DAY_WIDTH, place, placeOpen, ticksFor, toDay } from './gantt-axis'

// `gantt-layout.test.ts` exercises the axis through `layout`, which is how the
// views meet it. What is here is the arithmetic that has edges of its own: the
// ISO week's year-boundary rule, and the inclusive end date.

/**
 * An axis over an exact range, bypassing `axisFor`'s padding.
 *
 * The tick, `place` and `placeOpen` tests are about arithmetic over a domain and
 * not about how the domain was chosen — so they state the domain outright rather
 * than restating the padding rule in six expected values, which is what `axisFor`
 * has its own table for.
 */
function axis(start: string, end: string) {
  return { start: toDay(start), end: toDay(end), days: toDay(end) - toDay(start) + 1 }
}

describe('toDay', () => {
  it('counts whole days from the epoch, in UTC', () => {
    expect(toDay('1970-01-01')).toBe(0)
    expect(toDay('1970-01-02')).toBe(1)
    expect(toDay('2026-10-02') - toDay('2026-10-01')).toBe(1)
  })

  it('crosses a leap day', () => {
    expect(toDay('2028-03-01') - toDay('2028-02-28')).toBe(2)
  })
})

describe('axisFor', () => {
  it.each([
    ['week', '2026-10-07', '2026-10-07', '2026-09-28', 21],
    ['month', '2026-10-07', '2026-10-07', '2026-09-01', 91],
    ['quarter', '2026-10-07', '2026-10-07', '2026-07-01', 274],
    ['week', '2026-10-01', '2026-10-20', '2026-09-21', 42],
    ['month', '2026-10-15', '2026-12-02', '2026-09-01', 153],
    ['quarter', '2026-02-15', '2026-10-02', '2025-10-01', 547],
  ] as const)(
    'pads %s zoom out to whole units, plus one unit each side',
    (zoom, start, end, from, days) => {
      const padded = axisFor({ start, end }, zoom, toDay('2026-10-07'))

      expect(padded.start).toBe(toDay(from))
      expect(padded.days).toBe(days)
      expect(padded.end - padded.start + 1).toBe(days)
    },
  )

  it('leaves room to scroll on both sides of the plan', () => {
    // The point of the padding: there is calendar before the first bar and after
    // the last one, so "what happens the week after this ships" is a place the
    // reader can scroll to rather than a question the axis cuts off.
    const padded = axisFor({ start: '2026-10-05', end: '2026-10-09' }, 'week', 0)

    expect(padded.start).toBeLessThan(toDay('2026-10-05'))
    expect(padded.end).toBeGreaterThan(toDay('2026-10-09'))
  })

  it('falls back to the unit containing the anchor when nothing is dated', () => {
    expect(axisFor(null, 'month', toDay('2026-02-09')).days).toBe(90)
  })
})

// The axis has an intrinsic pixel width, which is what makes zoom change density
// rather than only tick labels — a fourteen-week lane used to squeeze thirty
// others into a few pixels each at every zoom.
describe('axisWidthOf', () => {
  it('is the day count times the zoom’s day width', () => {
    expect(axisWidthOf(axis('2026-10-01', '2026-10-31'), 'week')).toBe(31 * DAY_WIDTH.week)
  })

  it('gets narrower as the zoom gets coarser', () => {
    const october = axis('2026-10-01', '2026-10-31')

    expect(axisWidthOf(october, 'week')).toBeGreaterThan(axisWidthOf(october, 'month'))
    expect(axisWidthOf(october, 'month')).toBeGreaterThan(axisWidthOf(october, 'quarter'))
  })
})

describe('ticksFor', () => {
  it('numbers the weeks across a year boundary the way ISO-8601 does', () => {
    // 2027-01-01 is a Friday, so its week belongs to 2026 and reads W53.
    expect(ticksFor(axis('2026-12-21', '2027-01-24'), 'month').map((tick) => tick.label)).toEqual([
      'W52',
      'W53',
      'W1',
      'W2',
      'W3',
    ])
  })

  it('clips the first and last tick to the axis rather than overflowing it', () => {
    // October 2026 opens on a Thursday, so the first week tick is four days long.
    const ticks = ticksFor(axis('2026-10-01', '2026-10-31'), 'month')

    expect(ticks[0]).toMatchObject({ x: 0, width: 4 / 31 })
    expect(ticks.at(-1)).toMatchObject({ width: 6 / 31 })
    expect(ticks.reduce((sum, tick) => sum + tick.width, 0)).toBeCloseTo(1, 10)
  })
})

describe('place', () => {
  it('treats the end date as inclusive, so a one-day span has a day of width', () => {
    const october = axis('2026-10-01', '2026-10-31')

    expect(place({ start: '2026-10-01', end: '2026-10-01' }, october)).toEqual({
      x: 0,
      width: 1 / 31,
    })
    expect(place({ start: '2026-10-31', end: '2026-10-31' }, october)).toEqual({
      x: 30 / 31,
      width: 1 / 31,
    })
  })
})

// An open-ended bar runs from its start to today — and the two clamps are the
// whole reason this is not just `place` with today substituted for the end.
describe('placeOpen', () => {
  const october = axis('2026-10-01', '2026-10-31')

  it('runs from the start up to and including today', () => {
    expect(placeOpen({ start: '2026-10-01', end: null }, october, toDay('2026-10-10'))).toEqual({
      x: 0,
      width: 10 / 31,
    })
  })

  it('is one day wide when today has not reached the start yet', () => {
    // A lane dated into the future with no forecast end. A negative width would
    // draw the bar backwards out of the chart.
    expect(placeOpen({ start: '2026-10-20', end: null }, october, toDay('2026-10-10'))).toEqual({
      x: 19 / 31,
      width: 1 / 31,
    })
  })

  it('stops at the axis end when today is past it', () => {
    // The domain is padded from the plan's own extent, so a chart whose only
    // lane began months ago ends before now.
    expect(placeOpen({ start: '2026-10-25', end: null }, october, toDay('2027-03-01'))).toEqual({
      x: 24 / 31,
      width: 7 / 31,
    })
  })
})
