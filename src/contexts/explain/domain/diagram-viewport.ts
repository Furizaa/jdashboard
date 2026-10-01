// How a diagram is positioned under the eye: a scale and an offset, and the
// three moves that change them.
//
// A report's column is ~768px wide and a flowchart the agent drew for a change
// touching five systems is not readable at that size, so a diagram opens into an
// overlay that pans and zooms. The *arithmetic* of that lives here, pure, for
// the same reason `block-altitude` does: it is a rule, it has one right answer,
// and a transform that drifts by a pixel per wheel tick is a bug nobody can see
// in a snapshot.
//
// The convention is a CSS transform of `translate(x, y) scale(scale)` with
// `transform-origin: 0 0` — so `x`/`y` are in **stage pixels** (the overlay's own
// coordinates) and the content's own pixels are what `scale` multiplies.

export type DiagramViewport = {
  readonly scale: number
  readonly x: number
  readonly y: number
}

/** The diagram as the overlay first shows it: unscaled, unmoved. */
export const FIT_VIEWPORT: DiagramViewport = { scale: 1, x: 0, y: 0 }

/**
 * Below a quarter nothing is legible and below that nothing is findable; above
 * 8× a mermaid label is a wall of colour. Both ends exist so a trackpad flick
 * cannot lose the diagram entirely.
 */
export const MIN_SCALE = 0.25
export const MAX_SCALE = 8

/** One button press. 1.25 is small enough to aim with and large enough to feel. */
export const ZOOM_STEP = 1.25

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** The content-space point currently under a stage-space one. */
export function toContentPoint(
  viewport: DiagramViewport,
  point: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale }
}

/**
 * Zoom about a fixed point — the cursor, or the stage's centre for the buttons.
 *
 * The invariant is the whole point: whatever content sat under that point before
 * the zoom sits under it after. Zooming about the origin instead is what makes a
 * diagram viewer feel like it is fighting you.
 *
 * The ratio is computed from the *clamped* scale, so at either limit the
 * diagram holds still rather than sliding while the scale refuses to move.
 */
export function zoomAbout(
  viewport: DiagramViewport,
  factor: number,
  point: { readonly x: number; readonly y: number },
): DiagramViewport {
  const scale = clampScale(viewport.scale * factor)
  const ratio = scale / viewport.scale
  return {
    scale,
    x: point.x - (point.x - viewport.x) * ratio,
    y: point.y - (point.y - viewport.y) * ratio,
  }
}

export function panBy(viewport: DiagramViewport, dx: number, dy: number): DiagramViewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy }
}

/**
 * A wheel notch, as a zoom factor. Exponential because zoom is multiplicative —
 * two notches in and two notches out must land back where they started — and
 * capped per event because a single mouse wheel reports `deltaY: 100` where a
 * trackpad reports `3`.
 */
const WHEEL_SENSITIVITY = 400
const MAX_WHEEL_DELTA = 200

export function wheelZoomFactor(deltaY: number): number {
  const clamped = Math.min(MAX_WHEEL_DELTA, Math.max(-MAX_WHEEL_DELTA, deltaY))
  return Math.exp(-clamped / WHEEL_SENSITIVITY)
}

/** What the zoom readout says. Whole percent — nobody needs 137.4%. */
export function zoomLabel(viewport: DiagramViewport): string {
  return `${Math.round(viewport.scale * 100)}%`
}
