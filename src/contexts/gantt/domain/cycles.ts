import type { GanttChart } from '~/kernel'

// Cycle detection over the **edge** graph — `from blocks to` — which is a
// different graph from the `parentId` tree `tree.ts` repairs.
//
// A cycle is always **recorded and then reported**, never refused (ADR-0012 §6).
// The API does not 409 an edge that closes a loop, because an agent building a
// chart incrementally can create a cycle it intends to resolve two calls later,
// and an API that refuses to record a declared dependency ends up disagreeing
// with the plan. So the loop arrives here, gets named, and the chart says so: a
// plan that is impossible must *look* impossible, which is the most expensive
// thing a planning view can get wrong.
//
// Pure functions over kernel types. No I/O, no time, no framework.

export type GanttCycle = {
  /**
   * The loop in order, each node blocking the next and the last blocking the
   * first. Not closed — `['a', 'b', 'c']` means `a → b → c → a` — because the
   * warning reads it as `a → b → c → a` and a repeated first element would be
   * drawn twice.
   */
  readonly nodeIds: readonly string[]
  /** The edges that make up this loop, in the same order as `nodeIds`. */
  readonly edgeIds: readonly string[]
}

export type GanttCycles = {
  readonly cycles: readonly GanttCycle[]
  /** Every edge in any cycle — what the layout marks `inCycle` and the view dashes. */
  readonly edgeIds: ReadonlySet<string>
  /** Every node in any cycle — what `blockedStateFor` calls `unresolvable`. */
  readonly nodeIds: ReadonlySet<string>
}

const NO_CYCLES: GanttCycles = { cycles: [], edgeIds: new Set(), nodeIds: new Set() }

type OutEdge = { readonly to: string; readonly id: string }

/**
 * Every cycle reachable by one depth-first pass, as ordered node-id lists.
 *
 * Three-colour DFS: a node is unvisited, **on the current stack**, or finished.
 * An edge into a node on the stack is a back edge and names a loop — the slice
 * of the stack from that node onwards. Finished nodes are never re-entered,
 * which is what makes this terminate on the three shapes that hang a naive
 * walker: a self-edge (`from === to`, a one-node loop), two cycles sharing a
 * node, and a cycle reachable from several roots.
 *
 * It enumerates one cycle per back edge rather than every elementary circuit
 * (Johnson's algorithm). That is the honest trade: the warning's job is to name
 * *a* loop the reader has to go and break, and the set of nodes and edges
 * involved is exact either way.
 */
export function findCycles(chart: GanttChart): GanttCycles {
  if (chart.edges.length === 0) return NO_CYCLES

  const outEdges = new Map<string, OutEdge[]>()
  for (const edge of chart.edges) {
    const existing = outEdges.get(edge.from)
    if (existing === undefined) outEdges.set(edge.from, [{ to: edge.to, id: edge.id }])
    else existing.push({ to: edge.to, id: edge.id })
  }

  const cycles: GanttCycle[] = []
  const finished = new Set<string>()
  const onStack = new Set<string>()
  /** The node path currently being explored, and the edge that reached each step. */
  const path: string[] = []
  const viaEdge: string[] = []

  const visit = (nodeId: string): void => {
    onStack.add(nodeId)
    path.push(nodeId)
    for (const edge of outEdges.get(nodeId) ?? []) {
      if (onStack.has(edge.to)) {
        const from = path.indexOf(edge.to)
        cycles.push({
          nodeIds: path.slice(from),
          edgeIds: [...viaEdge.slice(from), edge.id],
        })
        continue
      }
      if (finished.has(edge.to)) continue
      viaEdge.push(edge.id)
      visit(edge.to)
      viaEdge.pop()
    }
    path.pop()
    onStack.delete(nodeId)
    finished.add(nodeId)
  }

  for (const node of chart.nodes) {
    if (!finished.has(node.id)) visit(node.id)
  }

  return {
    cycles,
    edgeIds: new Set(cycles.flatMap((cycle) => cycle.edgeIds)),
    nodeIds: new Set(cycles.flatMap((cycle) => cycle.nodeIds)),
  }
}
