import { COLUMNS, type Column } from '~/kernel'
import type { GanttTree, GanttTreeNode } from './tree'

// The n-of-m rollup: what a parent lane says about its descendants.
//
// A parent summarises them as a **distribution, not a state** (ADR-0012 §4) — a
// segmented bar plus "7 of 11 done" — because any single rolled-up state hides
// the answer the chart was opened for. "In Implementation" over eleven features
// could be one started and ten untouched, or ten shipped and one in review, and
// those are different projects.
//
// Progress is about `column` and nothing else. Dates are a separate question
// with a separate module (`child-span.ts`), and a percent was rejected outright:
// a number an agent invents and never revises, with no honest Jira equivalent,
// rendered as a confident partial bar.
//
// Pure functions over kernel types. No I/O, no time, no framework.

export type ColumnDistribution = Readonly<Record<Column, number>>

export type GanttProgress = {
  /** How many leaf descendants sit in each column. Sums to `total`. */
  readonly distribution: ColumnDistribution
  readonly done: number
  readonly total: number
}

function emptyDistribution(): Record<Column, number> {
  return Object.fromEntries(COLUMNS.map((column) => [column, 0])) as Record<Column, number>
}

/**
 * Per node, the `Column` distribution of its **leaf** descendants.
 *
 * Leaves only, because counting intermediate lanes would count the same work
 * twice — a PRD lane and the five features under it are one piece of work
 * described at two altitudes, and "6 of 6" for five done features and their
 * parent is a number nobody asked for.
 *
 * A childless node is **its own distribution**: `{ done: 0, total: 1 }` or
 * `{ done: 1, total: 1 }`. An empty rollup would make an undecomposed PRD
 * indistinguishable from a finished one.
 */
export function progressFor(tree: GanttTree): ReadonlyMap<string, GanttProgress> {
  const progress = new Map<string, GanttProgress>()

  const walk = (treeNode: GanttTreeNode): ColumnDistribution => {
    const distribution = emptyDistribution()
    if (treeNode.children.length === 0) {
      distribution[treeNode.node.column] += 1
    } else {
      for (const child of treeNode.children) {
        const childDistribution = walk(child)
        for (const column of COLUMNS) distribution[column] += childDistribution[column]
      }
    }
    const total = COLUMNS.reduce((sum, column) => sum + distribution[column], 0)
    progress.set(treeNode.node.id, { distribution, done: distribution.Done, total })
    return distribution
  }

  for (const root of tree.roots) walk(root)
  return progress
}

/**
 * The rollup for a node that is not in the tree at all. Unreachable through
 * `layout` — every chart node is in the tree, because `buildTree` drops none —
 * but a `{ done: 0, total: 0 }` is the honest answer to "how much of nothing is
 * done" and it keeps the lookup total.
 */
export const NO_PROGRESS: GanttProgress = {
  distribution: emptyDistribution(),
  done: 0,
  total: 0,
}
