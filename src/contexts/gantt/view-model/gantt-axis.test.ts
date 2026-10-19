import { describe, expect, it } from 'vitest'
import { axisFor, place, placeOpen, ticksFor, toDay } from './gantt-axis'

// `gantt-layout.test.ts` exercises the axis through `layout`, which is how the
// views meet it. What is here is the arithmetic that has edges of its own: the
// ISO week's year-boundary rule, and the inclusive end date.

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
    ['week', '2026-10-07', '2026-10-07', '2026-10-05', 7],
    ['month', '2026-10-07', '2026-10-07', '2026-10-01', 31],
    ['quarter', '2026-10-07', '2026-10-07', '2026-10-01', 92],
    ['week', '2026-10-01', '2026-10-20', '2026-09-28', 28],
    ['month', '2026-10-15', '2026-12-02', '2026-10-01', 92],
    ['quarter', '2026-02-15', '2026-10-02', '2026-01-01', 365],
  ] as const)('pads %s zoom out to whole units', (zoom, start, end, from, days) => {
    const axis = axisFor({ start, end }, zoom, toDay('2026-10-07'))

    expect(axis.start).toBe(toDay(from))
    expect(axis.days).toBe(days)
    expect(axis.end - axis.start + 1).toBe(days)
  })

  it('falls back to the one unit containing the anchor when nothing is dated', () => {
    expect(axisFor(null, 'month', toDay('2026-02-09')).days).toBe(28)
  })
})

describe('ticksFor', () => {
  it('numbers the weeks across a year boundary the way ISO-8601 does', () => {
    // 2027-01-01 is a Friday, so its week belongs to 2026 and reads W53.
    const axis = axisFor({ start: '2026-12-20', end: '2027-01-10' }, 'month', 0)

    expect(ticksFor(axis, 'month').map((tick) => tick.label)).toEqual([
      'W49',
      'W50',
      'W51',
      'W52',
      'W53',
      'W1',
      'W2',
      'W3',
      'W4',
    ])
  })

  it('clips the first and last tick to the axis rather than overflowing it', () => {
    // October 2026 opens on a Thursday, so the first week tick is four days long.
    const ticks = ticksFor(axisFor({ start: '2026-10-05', end: '2026-10-09' }, 'month', 0), 'month')

    expect(ticks[0]).toMatchObject({ x: 0, width: 4 / 31 })
    expect(ticks.at(-1)).toMatchObject({ width: 6 / 31 })
    expect(ticks.reduce((sum, tick) => sum + tick.width, 0)).toBeCloseTo(1, 10)
  })
})

describe('place', () => {
  it('treats the end date as inclusive, so a one-day span has a day of width', () => {
    const axis = axisFor({ start: '2026-10-01', end: '2026-10-31' }, 'month', 0)

    expect(place({ start: '2026-10-01', end: '2026-10-01' }, axis)).toEqual({ x: 0, width: 1 / 31 })
    expect(place({ start: '2026-10-31', end: '2026-10-31' }, axis)).toEqual({
      x: 30 / 31,
      width: 1 / 31,
    })
  })
})

// An open-ended bar runs from its start to today — and the two clamps are the
// whole reason this is not just `place` with today substituted for the end.
describe('placeOpen', () => {
  const october = axisFor({ start: '2026-10-01', end: '2026-10-31' }, 'month', 0)

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
