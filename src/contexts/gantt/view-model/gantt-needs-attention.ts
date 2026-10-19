import type { GanttChart } from '~/kernel'
import { datedSpanOf, openSpanOf, type GanttTree } from '../domain'

// What a chart is waiting on a human — or an agent — to do to it.
//
// Its own file beside `gantt-layout.ts` because it is a different question from
// geometry: nothing in here has a position, and the answer is a sentence in the
// header rather than anything drawn on the time axis. The layout calls it and
// passes it through, which is the whole of their relationship.
//
// Pure functions over kernel types. No I/O, no time, no framework.

export type GanttNeedsAttention = {
  /** Nodes with **no start**. Each array is both the count (`.length`) and the ids. */
  readonly undated: readonly string[]
  /**
   * Nodes with a start and no end — in flight, with nobody forecasting a finish.
   *
   * Its own count rather than part of `undated`, because the two ask for
   * different work: "nobody knows when this starts" and "nobody has forecast
   * when this ends" are separate sentences in the instruction that fixes them.
   */
  readonly openEnded: readonly string[]
  readonly unplacedAtRoot: readonly string[]
  readonly orphaned: readonly string[]
  /** Nodes needing attention for any of the four reasons, counted once. */
  readonly total: number
}

/**
 * The things a chart can be waiting on a human — or an agent — to fix, so one
 * header can state all of them (ADR-0012 §4).
 *
 * `undated` and `openEnded` are **exclusive and separately counted**: a lane
 * with no start at all is undated, a lane with a start and no end is in flight.
 * Reading the second as the first is what drew eight known starts as eight blank
 * rows, and the instruction that fixes each is a different instruction.
 *
 * `unplacedAtRoot` is the judgement call. A root lane someone *chose* to put
 * there is not unplaced, so what counts is a root lane nobody chose: a node
 * whose `parentId` named a node that is not in the chart, and a childless
 * **jira** node still sitting where import dropped it. A jira lane at the root
 * with children under it is doing a PRD lane's job and is left alone.
 */
export function needsAttentionFor(chart: GanttChart, tree: GanttTree): GanttNeedsAttention {
  const undated: string[] = []
  const openEnded: string[] = []
  const unplacedAtRoot: string[] = []
  const orphaned: string[] = []
  for (const node of chart.nodes) {
    if (openSpanOf(node) !== null) openEnded.push(node.id)
    else if (datedSpanOf(node) === null) undated.push(node.id)
    if (node.orphaned) orphaned.push(node.id)
    const atRoot = (tree.parentOf.get(node.id) ?? null) === null
    const childless = (tree.byId.get(node.id)?.children.length ?? 0) === 0
    if (atRoot && (tree.reRooted.has(node.id) || (node.source.kind === 'jira' && childless))) {
      unplacedAtRoot.push(node.id)
    }
  }
  return {
    undated,
    openEnded,
    unplacedAtRoot,
    orphaned,
    total: new Set([...undated, ...openEnded, ...unplacedAtRoot, ...orphaned]).size,
  }
}
