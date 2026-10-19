import type { GanttChart } from '~/kernel'
import { findCycles } from './cycles'

// Whether a lane is waiting on something — **derived from the edge graph, never
// stored** (ADR-0012 §4).
//
// The kernel `Column` is the chart's progress vocabulary, and it costs exactly
// one thing here: `COLUMN_TO_STATUSES` folds `'Blocked'` into `'TO DO'`, erasing
// the one state a dependency chart is about. Deriving it back from the arrows is
// what pays that cost off, and it pays twice. It cannot go stale when the
// blocker ships — there is no field to forget to clear — and it makes the arrows
// load-bearing rather than decorative: the only way to say "this is blocked" is
// to declare the dependency, which is the thing the chart exists to show.
//
// Pure functions over kernel types. No I/O, no time, no framework.

/**
 * `'blocked'` is waiting on work that is not `Done`. `'unresolvable'` is waiting
 * on itself, directly or round a loop — a plan that cannot be executed in any
 * order, which is a different and worse thing than being behind a queue, so it
 * gets its own word rather than a louder `'blocked'`.
 */
export type GanttBlockedState = 'none' | 'blocked' | 'unresolvable'

/**
 * Every node's blocked state.
 *
 * A node is `blocked` when some node with an edge **into** it is not `Done`.
 * Only the direct blocker is consulted: a node two hops behind an unfinished
 * one is blocked by its own immediate blocker anyway, so transitive closure
 * would add no node to the set and would make the badge mean "somewhere
 * upstream" instead of "waiting on this".
 *
 * `unresolvable` wins over `blocked` — a node in a cycle is almost always also
 * behind an unfinished blocker, and the loop is the fact worth reporting.
 */
export function blockedStateFor(chart: GanttChart): ReadonlyMap<string, GanttBlockedState> {
  const columnOf = new Map(chart.nodes.map((node) => [node.id, node.column] as const))
  const inCycle = findCycles(chart).nodeIds

  const blocked = new Set<string>()
  for (const edge of chart.edges) {
    // An edge whose `from` is not a node in the chart cannot happen — the schema
    // refuses it — but `?? 'Done'` keeps a hand-edited file from inventing a
    // blocker nobody can see or clear.
    if ((columnOf.get(edge.from) ?? 'Done') !== 'Done') blocked.add(edge.to)
  }

  return new Map(
    chart.nodes.map((node) => {
      if (inCycle.has(node.id)) return [node.id, 'unresolvable'] as const
      return [node.id, blocked.has(node.id) ? 'blocked' : 'none'] as const
    }),
  )
}
