import type { GanttTick } from '../view-model'

// The time dimension, drawn: the tick strip above the lanes and the gridlines
// behind them. Both read the same `ticks`, so a label and the line under it
// cannot disagree.
//
// Every position here is a **fraction of the axis**, turned into a percentage
// (ADR-0012 §10). That is what keeps the chart free of a ResizeObserver: the bar
// region is as wide as it is, and `left: 42%` means the same thing at every
// width — so a resize is a repaint rather than a recomputation.

/** A layout fraction as the CSS percentage the browser positions by. */
export function pct(fraction: number): string {
  return `${fraction * 100}%`
}

export function GanttAxis({
  ticks,
  todayX,
}: {
  ticks: readonly GanttTick[]
  todayX: number | null
}) {
  return (
    <div className="relative h-7 min-w-0 flex-1">
      {ticks.map((tick) => (
        <div
          key={tick.key}
          className="border-border/70 absolute inset-y-0 overflow-hidden border-l pt-1.5 pl-1"
          style={{ left: pct(tick.x), width: pct(tick.width) }}
        >
          <span className="text-ink-tertiary text-[10px] whitespace-nowrap tabular-nums">
            {tick.label}
          </span>
        </div>
      ))}
      {todayX !== null && (
        <div
          className="bg-primary absolute top-0 bottom-0 w-px"
          style={{ left: pct(todayX) }}
          aria-hidden
        />
      )}
    </div>
  )
}

/**
 * The gridlines behind the lanes — one per tick, and the today line over them.
 *
 * `aria-hidden` throughout: the axis strip above already names every tick, and a
 * screen reader reading the same twelve dates twice is noise.
 */
export function GanttGridLines({
  ticks,
  todayX,
}: {
  ticks: readonly GanttTick[]
  todayX: number | null
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {ticks.map((tick) => (
        <div
          key={tick.key}
          className="border-border/40 absolute inset-y-0 border-l"
          style={{ left: pct(tick.x) }}
        />
      ))}
      {todayX !== null && (
        <div
          className="bg-primary/60 absolute inset-y-0 w-px"
          style={{ left: pct(todayX) }}
          data-today="true"
        />
      )}
    </div>
  )
}
