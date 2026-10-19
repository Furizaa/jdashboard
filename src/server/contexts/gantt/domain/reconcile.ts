import { columnForStatus } from '~/kernel/columns'
import type {
  GanttChart,
  GanttEdge,
  GanttEdgeSource,
  GanttNode,
  MIRRORED_NODE_FIELDS,
} from '../../../lib/gantt-schema'

// What one sync would change, as a value — the heart of the slice.
//
// **No output of `reconcile` can be a node move or a node delete, and that is a
// property of the type rather than of the code below.** There is no field for a
// removal, no field for a reparent, and `MirrorUpdate.fields` is
// `Pick<GanttNode, …MIRRORED_NODE_FIELDS>`, so `parentId`, `order`, `start` and
// `end` are not nameable in one. A careless sync is the thing this slice exists
// to make impossible: a Jira-backed node carries local children, a body,
// declared edges and hand-set dates, and deleting it because its ticket left the
// epic would destroy all of that, silently, in the background (ADR-0012 §5).
//
// So sync **refreshes** mirrored fields, **adds** newly discovered keys, and
// **marks** departures `orphaned`. Jira's parent is used once, at import, as the
// initial placement; after that the chart owns the tree forever.
//
// Pure, and the only way to apply a reconciliation is `applyReconciliation`
// below — the diff and its interpretation live in one file so neither can drift
// from the invariant the other states.

/**
 * One discovered ticket, as the search saw it. The gateway's raw shape is
 * flattened into this by the application layer, so everything here is a plain
 * fact about a Jira issue and this module never meets an HTTP response.
 */
export type DiscoveredIssue = {
  readonly key: string
  readonly title: string
  /** The real HDR status name, which is not the column's name. */
  readonly status: string
  readonly assignee: string | null
  /** Jira's parent — a one-time import suggestion, never a move (ADR-0012 §5). */
  readonly parentKey: string | null
  readonly links: readonly DiscoveredLink[]
}

/**
 * A `blocks` relationship, **normalised to one direction**: Jira reports the
 * same link as `outward` on the blocker and `inward` on the blocked issue, and
 * an epic's search returns both ends, so without normalisation one dependency
 * would arrive twice and be drawn twice.
 */
export type DiscoveredLink = {
  readonly linkId: string
  readonly blockerKey: string
  readonly blockedKey: string
}

/** The four fields sync owns, taken from the schema rather than re-listed. */
export type MirroredFields = Pick<GanttNode, (typeof MIRRORED_NODE_FIELDS)[number]>

/**
 * A refresh of one node's mirrored half. `fields` is the whole payload and its
 * type is the schema's own list, so a reviewer checking "can sync move a node"
 * reads one line and is done.
 */
export type MirrorUpdate = {
  readonly nodeId: string
  readonly fields: MirroredFields
}

/**
 * A newly discovered ticket, **flat and undated**: `start` and `end` are `null`
 * literals rather than `string | null` because an addition is never dated —
 * dates are chart-owned and import fabricates none (ADR-0012 §4) — and
 * `orphaned` is `false` for the same reason.
 */
export type NodeAddition = Omit<GanttNode, 'start' | 'end' | 'orphaned'> & {
  readonly start: null
  readonly end: null
  readonly orphaned: false
}

/** A local edge Jira now reports as a real link: promoted, not duplicated. */
export type EdgePromotion = {
  readonly edgeId: string
  readonly source: Extract<GanttEdgeSource, { kind: 'jira' }>
}

/**
 * The complete output. Six fields, and the two that could destroy a plan —
 * a node removal and a node reparent — are **absent**, not merely unused.
 */
export type Reconciliation = {
  readonly mirrorUpdates: readonly MirrorUpdate[]
  readonly additions: readonly NodeAddition[]
  /**
   * Every mirrored node whose key the search did not return — the **set**, not
   * the delta. A ticket that comes back to its epic therefore loses its badge
   * on the next sync, which a delta could not express.
   */
  readonly orphanedIds: readonly string[]
  readonly edgeAdditions: readonly GanttEdge[]
  /** Edge ids. **Jira-sourced only** — a local edge is never removed by sync. */
  readonly edgeRemovals: readonly string[]
  readonly edgePromotions: readonly EdgePromotion[]
}

/** Nothing to do: the chart named no epics, so nothing was discovered either. */
export const NO_RECONCILIATION: Reconciliation = {
  mirrorUpdates: [],
  additions: [],
  orphanedIds: [],
  edgeAdditions: [],
  edgeRemovals: [],
  edgePromotions: [],
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/** A jira node takes its lowercased key as its id (ADR-0012 §8). */
export function nodeIdForKey(key: string): string {
  return key.toLowerCase()
}

const keyOf = (node: GanttNode): string | null =>
  node.source.kind === 'jira' ? node.source.key.toUpperCase() : null

const mirroredOf = (issue: DiscoveredIssue): MirroredFields => ({
  title: issue.title,
  column: columnForStatus(issue.status),
  status: issue.status,
  assignee: issue.assignee,
})

const differs = (node: GanttNode, next: MirroredFields): boolean =>
  node.title !== next.title ||
  node.column !== next.column ||
  node.status !== next.status ||
  node.assignee !== next.assignee

/**
 * Where a newly discovered ticket lands: under its Jira parent when that parent
 * is itself a node — one already in the chart, or one this same reconcile is
 * adding — and at the root otherwise. This is the **only** time Jira's hierarchy
 * is consulted, and it is a suggestion rather than a mirror.
 */
function placementFor(
  issue: DiscoveredIssue,
  nodeIdByKey: ReadonlyMap<string, string>,
): string | null {
  if (issue.parentKey === null) return null
  return nodeIdByKey.get(issue.parentKey.toUpperCase()) ?? null
}

/** One past the last sibling, so an addition never lands on top of a lane. */
function nextOrderUnder(
  parentId: string | null,
  nodes: readonly { parentId: string | null; order: number }[],
): number {
  const siblings = nodes.filter((node) => node.parentId === parentId)
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((node) => node.order)) + 1
}

function reconcileNodes(
  chart: GanttChart,
  discovered: readonly DiscoveredIssue[],
): Pick<Reconciliation, 'mirrorUpdates' | 'additions' | 'orphanedIds'> {
  const byKey = new Map(discovered.map((issue) => [issue.key.toUpperCase(), issue]))
  const nodeIdByKey = new Map<string, string>()
  for (const node of chart.nodes) {
    const key = keyOf(node)
    if (key !== null) nodeIdByKey.set(key, node.id)
  }

  const mirrorUpdates: MirrorUpdate[] = []
  const orphanedIds: string[] = []
  for (const node of chart.nodes) {
    const key = keyOf(node)
    if (key === null) continue
    const issue = byKey.get(key)
    if (issue === undefined) {
      orphanedIds.push(node.id)
      continue
    }
    const fields = mirroredOf(issue)
    if (differs(node, fields)) mirrorUpdates.push({ nodeId: node.id, fields })
  }

  // Placement reads the nodes already placed *plus* the ones placed earlier in
  // this same loop, so a batch import nests a discovered child under its
  // discovered parent rather than dropping both at the root.
  const placed: { parentId: string | null; order: number }[] = chart.nodes.map((node) => ({
    parentId: node.parentId,
    order: node.order,
  }))
  const additions: NodeAddition[] = []
  for (const issue of discovered) {
    if (nodeIdByKey.has(issue.key.toUpperCase())) continue
    const id = nodeIdForKey(issue.key)
    const parentId = placementFor(issue, nodeIdByKey)
    const order = nextOrderUnder(parentId, placed)
    additions.push({
      id,
      parentId,
      order,
      source: { kind: 'jira', key: issue.key },
      start: null,
      end: null,
      orphaned: false,
      ...mirroredOf(issue),
    })
    nodeIdByKey.set(issue.key.toUpperCase(), id)
    placed.push({ parentId, order })
  }

  return { mirrorUpdates, additions, orphanedIds }
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

const pairOf = (from: string, to: string): string => `${from}\u0000${to}`

/** A link id is a Jira number; this keeps an unusual one inside the slug charset. */
function edgeIdForLink(linkId: string, taken: ReadonlySet<string>): string {
  const base = `jira-${linkId.toLowerCase().replaceAll(/[^a-z0-9-]/gu, '-')}`.slice(0, 60)
  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function reconcileEdges(
  chart: GanttChart,
  discovered: readonly DiscoveredIssue[],
  additions: readonly NodeAddition[],
): Pick<Reconciliation, 'edgeAdditions' | 'edgeRemovals' | 'edgePromotions'> {
  // Both endpoints have to be lanes in the chart or the layout has an arrow it
  // cannot draw — and `ganttChartSchema` refuses a chart that contains one.
  const nodeIdByKey = new Map<string, string>()
  const keyByNodeId = new Map<string, string>()
  for (const node of [...chart.nodes, ...additions]) {
    if (node.source.kind !== 'jira') continue
    nodeIdByKey.set(node.source.key.toUpperCase(), node.id)
    keyByNodeId.set(node.id, node.source.key.toUpperCase())
  }
  const discoveredKeys = new Set(discovered.map((issue) => issue.key.toUpperCase()))
  const wasLookedAt = (nodeId: string): boolean => {
    const key = keyByNodeId.get(nodeId)
    return key !== undefined && discoveredKeys.has(key)
  }

  // One entry per dependency, keyed by the node pair: the same link arrives
  // twice (once from each end) whenever both tickets are in the epic.
  const linkByPair = new Map<string, { linkId: string; from: string; to: string }>()
  for (const issue of discovered) {
    for (const link of issue.links) {
      const from = nodeIdByKey.get(link.blockerKey.toUpperCase())
      const to = nodeIdByKey.get(link.blockedKey.toUpperCase())
      if (from === undefined || to === undefined || from === to) continue
      const pair = pairOf(from, to)
      if (!linkByPair.has(pair)) linkByPair.set(pair, { linkId: link.linkId, from, to })
    }
  }

  const existingPairs = new Set(chart.edges.map((edge) => pairOf(edge.from, edge.to)))
  const edgeRemovals: string[] = []
  const edgePromotions: EdgePromotion[] = []
  for (const edge of chart.edges) {
    const pair = pairOf(edge.from, edge.to)
    const link = linkByPair.get(pair)
    if (edge.source.kind === 'local') {
      // The one reconciliation rule for a local edge: a pair Jira now reports as
      // a real link is **promoted**, so the dependency is drawn once rather than
      // twice (ADR-0012 §6). Nothing else sync does can touch it — not even
      // between two Jira tickets, which is the common and important case.
      if (link !== undefined) {
        edgePromotions.push({ edgeId: edge.id, source: { kind: 'jira', linkId: link.linkId } })
      }
      continue
    }
    if (link !== undefined) continue
    // A jira edge whose link the search no longer reports. Only removed when
    // both of its tickets were actually looked at: an endpoint that has left the
    // epic is an absence of evidence, not evidence the link was deleted.
    if (wasLookedAt(edge.from) && wasLookedAt(edge.to)) edgeRemovals.push(edge.id)
  }

  const takenIds = new Set(chart.edges.map((edge) => edge.id))
  const edgeAdditions: GanttEdge[] = []
  for (const [pair, link] of linkByPair) {
    if (existingPairs.has(pair)) continue
    const id = edgeIdForLink(link.linkId, takenIds)
    takenIds.add(id)
    edgeAdditions.push({
      id,
      from: link.from,
      to: link.to,
      source: { kind: 'jira', linkId: link.linkId },
    })
  }

  return { edgeAdditions, edgeRemovals, edgePromotions }
}

// ---------------------------------------------------------------------------
// The verb
// ---------------------------------------------------------------------------

/** What this chart and this search disagree about, and nothing more. */
export function reconcile(
  chart: GanttChart,
  discovered: readonly DiscoveredIssue[],
): Reconciliation {
  const nodes = reconcileNodes(chart, discovered)
  return { ...nodes, ...reconcileEdges(chart, discovered, nodes.additions) }
}

/**
 * The reconciliation applied — the only interpretation of one there is.
 *
 * Every existing node keeps its identity, its place in the tree, its order, its
 * dates and its body: the spread writes `fields` and `orphaned` and there is
 * nothing else in a `MirrorUpdate` to write. A local node is not touched at all,
 * because sync has no opinion about a lane the chart is the only copy of.
 */
export function applyReconciliation(chart: GanttChart, change: Reconciliation): GanttChart {
  const updates = new Map(change.mirrorUpdates.map((update) => [update.nodeId, update.fields]))
  const orphaned = new Set(change.orphanedIds)
  const removed = new Set(change.edgeRemovals)
  const promoted = new Map(change.edgePromotions.map((p) => [p.edgeId, p.source]))

  return {
    ...chart,
    nodes: [
      ...chart.nodes.map((node) => refresh(node, updates.get(node.id), orphaned.has(node.id))),
      ...change.additions,
    ],
    edges: [
      ...chart.edges
        .filter((edge) => !removed.has(edge.id))
        .map((edge) => promote(edge, promoted.get(edge.id))),
      ...change.edgeAdditions,
    ],
  }
}

/**
 * A refreshed **copy** of one node — the node read off disk is never mutated.
 * A local node comes back untouched, and `orphaned` is assigned from the set
 * rather than or-ed into it, so a ticket that returns to its epic loses the
 * badge. Nothing else can be written: `fields` is the whole of a `MirrorUpdate`.
 */
function refresh(
  node: GanttNode,
  fields: MirroredFields | undefined,
  orphaned: boolean,
): GanttNode {
  return node.source.kind === 'jira' ? { ...node, ...fields, orphaned } : node
}

/** A promoted copy, or the edge itself — never a mutation of the stored one. */
function promote(edge: GanttEdge, source: GanttEdgeSource | undefined): GanttEdge {
  return source === undefined ? edge : { ...edge, source }
}

/** The counts one changelog entry names, in the order the summary reads them. */
export type ReconciliationCounts = {
  readonly updated: number
  readonly added: number
  readonly orphaned: number
  readonly edgesAdded: number
  readonly edgesRemoved: number
  readonly edgesPromoted: number
}

export function countsOf(change: Reconciliation): ReconciliationCounts {
  return {
    updated: change.mirrorUpdates.length,
    added: change.additions.length,
    orphaned: change.orphanedIds.length,
    edgesAdded: change.edgeAdditions.length,
    edgesRemoved: change.edgeRemovals.length,
    edgesPromoted: change.edgePromotions.length,
  }
}
