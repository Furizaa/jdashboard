import { CalendarOff } from 'lucide-react'
import { testIds } from '~/lib/testids'

// A chart where **nothing at all** is dated, saying so.
//
// Without this it drew an axis, a today line and a screenful of empty rows, and
// a reader reasonably read that as a broken chart rather than as a chart waiting
// for someone to date it — the today line was mistaken for one-pixel bars. The
// "needs attention · 29 undated" line was present and far too quiet, because a
// count in a header does not answer "is this thing working".
//
// So it takes `CycleWarning`'s shape and inverts its tone. A cycle is a plan
// that cannot execute and is drawn as an alert; an undated chart is **correct**
// — dates are chart-owned and nullable, and import leaves every chart exactly
// like this (ADR-0012 §4) — so this is a `status`, on the surface ladder rather
// than in destructive tones, and it says what is right before it says what is
// missing.
//
// It names the **verb**. A reader who sees a banner naming the thing they
// cannot do themselves — the UI never writes a date, the agent is the only
// writer (ADR-0012 §8) — should come away knowing exactly what to ask an agent
// for, with the chart's own id already in it.

export function NoDatesBanner({ chartId }: { chartId: string }) {
  return (
    <div
      data-testid={testIds.ganttNoDatesBanner}
      data-chart-id={chartId}
      role="status"
      // `CycleWarning`'s band at a calmer strength, in the amber the
      // needs-attention line already uses for "waiting on someone" rather than
      // the destructive tones it keeps for "this cannot execute".
      className="flex items-start gap-2 border-b border-amber-400/25 bg-amber-400/5 px-4 py-2"
    >
      <CalendarOff size={13} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
      <div className="min-w-0 text-[11px] leading-relaxed">
        <p className="text-foreground font-medium">
          No lane on this chart has a date yet.{' '}
          <span className="text-ink-subtle font-normal">
            Nothing is wrong with it — the lanes, the dependencies and the progress are all here.
            Dates are the one thing only an agent can write.
          </span>
        </p>
        <p className="text-ink-subtle mt-0.5">
          Ask one to date it with{' '}
          <span className="text-foreground font-mono">POST /charts/{chartId}/dates</span>, which
          reads each mirrored ticket&rsquo;s status history and fills the blanks.
        </p>
      </div>
    </div>
  )
}
