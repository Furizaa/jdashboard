import { describe, expect, it } from 'vitest'
import {
  clampScale,
  FIT_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  toContentPoint,
  wheelZoomFactor,
  zoomAbout,
  ZOOM_STEP,
  zoomLabel,
  type DiagramViewport,
} from './diagram-viewport'

// Pure call/assert. The one claim worth testing properly is the zoom invariant:
// the content under the cursor does not move.

const CURSOR = { x: 300, y: 200 }

describe('clampScale', () => {
  it.each([
    [0.01, MIN_SCALE],
    [MIN_SCALE, MIN_SCALE],
    [1, 1],
    [MAX_SCALE, MAX_SCALE],
    [1_000, MAX_SCALE],
  ])('%s → %s', (scale, expected) => {
    expect(clampScale(scale)).toBe(expected)
  })
})

describe('zoomAbout', () => {
  it('leaves the content under the fixed point exactly where it was', () => {
    const before = toContentPoint(FIT_VIEWPORT, CURSOR)
    const after = toContentPoint(zoomAbout(FIT_VIEWPORT, ZOOM_STEP, CURSOR), CURSOR)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
  })

  it('holds the invariant from a viewport that is already panned and zoomed', () => {
    const panned: DiagramViewport = { scale: 2.5, x: -420, y: 130 }
    const before = toContentPoint(panned, CURSOR)
    const after = toContentPoint(zoomAbout(panned, 1 / ZOOM_STEP, CURSOR), CURSOR)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
  })

  it('is reversible: in then out lands back where it started', () => {
    const once = zoomAbout(FIT_VIEWPORT, ZOOM_STEP, CURSOR)
    const back = zoomAbout(once, 1 / ZOOM_STEP, CURSOR)
    expect(back.scale).toBeCloseTo(FIT_VIEWPORT.scale, 10)
    expect(back.x).toBeCloseTo(FIT_VIEWPORT.x, 10)
    expect(back.y).toBeCloseTo(FIT_VIEWPORT.y, 10)
  })

  it('does not drift once the scale is pinned at a limit', () => {
    // A trackpad flick at the limit must not slide the diagram off the stage
    // while the scale refuses to change.
    const pinned: DiagramViewport = { scale: MAX_SCALE, x: -100, y: -50 }
    expect(zoomAbout(pinned, 4, CURSOR)).toEqual(pinned)
  })

  it('clamps rather than passing the limit', () => {
    expect(zoomAbout({ scale: MIN_SCALE, x: 0, y: 0 }, 0.1, CURSOR).scale).toBe(MIN_SCALE)
    expect(zoomAbout({ scale: MAX_SCALE, x: 0, y: 0 }, 10, CURSOR).scale).toBe(MAX_SCALE)
  })
})

describe('panBy', () => {
  it('moves the offset and leaves the scale alone', () => {
    expect(panBy({ scale: 2, x: 10, y: 20 }, -5, 7)).toEqual({ scale: 2, x: 5, y: 27 })
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in on a scroll up and out on a scroll down', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
    expect(wheelZoomFactor(0)).toBe(1)
  })

  it('is symmetric, so a notch out undoes a notch in', () => {
    expect(wheelZoomFactor(-60) * wheelZoomFactor(60)).toBeCloseTo(1, 10)
  })

  it('caps one event, so a mouse wheel and a trackpad are in the same ballpark', () => {
    // A single mouse notch reports deltaY 100 where a trackpad reports 3; an
    // uncapped exponential would make one flick a 20× jump.
    expect(wheelZoomFactor(-10_000)).toBe(wheelZoomFactor(-200))
  })
})

describe('zoomLabel', () => {
  it.each([
    [1, '100%'],
    [0.25, '25%'],
    [1.374, '137%'],
  ])('%s → %s', (scale, expected) => {
    expect(zoomLabel({ scale, x: 0, y: 0 })).toBe(expected)
  })
})
