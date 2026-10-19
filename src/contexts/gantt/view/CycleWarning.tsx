import { TriangleAlert } from 'lucide-react'
import { testIds } from '~/lib/testids'
import type { GanttCycle } from '../domain'

// A plan where two PRDs each wait on the other is impossible, and it must not
// look possible — the most expensive thing a planning view can get wrong
// (ADR-0012 §6).
//
// So the loop is **named**, in order, by title. The API never refused to record
// it: an agent building a chart incrementally will create a cycle it intends to
// resolve two calls later, and an API that rejects a declared dependency ends up
// disagreeing with the plan. Reporting it here is the other half of that choice.

export function CycleWarning({
  cycles,
  titleOf,
}: {
  cycles: readonly GanttCycle[]
  titleOf: (nodeId: string) => string
}) {
  if (cycles.length === 0) return null
  return (
    <div
      data-testid={testIds.ganttCycleWarning}
      data-count={cycles.length}
      role="alert"
      className="border-destructive/40 bg-destructive/10 flex items-start gap-2 border-b px-4 py-2"
    >
      <TriangleAlert size={13} className="text-destructive mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 text-[11px] leading-relaxed">
        <p className="text-foreground font-medium">
          {cycles.length === 1
            ? 'This plan contains a dependency cycle.'
            : `This plan contains ${cycles.length} dependency cycles.`}{' '}
          <span className="text-ink-subtle font-normal">
            Every lane in a loop is unresolvable — there is no order that executes it.
          </span>
        </p>
        <ul className="text-ink-subtle mt-0.5 space-y-0.5">
          {cycles.map((cycle) => (
            <li key={cycle.edgeIds.join('|')} className="truncate">
              {/* Closed on the way out: `nodeIds` is `[a, b, c]` and the loop is
                  `a → b → c → a`, so the first name is repeated here rather than
                  stored twice. */}
              {[...cycle.nodeIds, cycle.nodeIds[0] ?? ''].map(titleOf).join(' → ')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
