import { Effect } from 'effect'
import { archiveChart, readChart } from '../../../lib/gantt-store'
import { recordChange, type GanttWrites } from '../../../lib/gantt-writes'
import { ChartNotFound } from '../errors'

// The one lifecycle verb the **human** owns, and the reason there is no
// `DELETE /charts/:chartId` to pair it with (ADR-0012 §8).
//
// Single-writer is a rule about chart *content*: the agent maintains the plan
// and the UI never contradicts it. Chart *lifecycle* is a different question,
// and the irreversible verb over a system of record belongs with the person
// rather than with a process acting on paraphrased instructions. So this
// use-case has exactly one consumer — `archiveGanttChart`, behind a confirmation
// dialog naming the chart — and deliberately no REST route.
//
// It is also not a delete. `archiveChart` *moves* the folder to
// `gantt/.archive/<chartId>/`, bodies and changelog with it, and never
// overwrites an entry already there.

export type ArchiveChartResult = {
  /** Where the folder landed, so the dialog can say the plan still exists. */
  readonly archivedTo: string
}

/**
 * Archive one chart, inside its own write lock.
 *
 * The lock matters more here than for a field patch: the folder is about to move
 * out from under any write queued behind it, and serialising means an agent's
 * in-flight `PATCH` completes against the chart it read rather than against a
 * path that vanished mid-call.
 *
 * The changelog entry is appended **before** the move, on purpose. It lives
 * inside the chart's own folder, so writing it first archives it with the plan;
 * writing it after would re-create the directory the move just emptied — an
 * empty chart folder beside an archived one, which is the one outcome worse than
 * either.
 */
export function archiveChartById(
  chartId: string,
  writes: GanttWrites,
): Effect.Effect<ArchiveChartResult, ChartNotFound> {
  return Effect.promise(() =>
    writes.withChartLock(chartId, async () => {
      const chart = await readChart(chartId, writes.deps)
      if (chart === null) return null
      await recordChange(writes, chartId, 'user', `Archived the chart “${chart.title}”.`)
      return { archivedTo: await archiveChart(chartId, writes.deps) }
    }),
  ).pipe(
    Effect.flatMap((outcome) =>
      outcome === null ? Effect.fail(new ChartNotFound({ chartId })) : Effect.succeed(outcome),
    ),
  )
}
