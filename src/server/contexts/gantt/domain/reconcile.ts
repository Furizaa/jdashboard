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
// `end` are not nameable in one. What a careless sync would destroy, and why
// that makes this the shape it is: ADR-0012 §5.
//
// So sync **refreshes** mirrored fields, **adds** newly discovered keys, and
// **marks** as `orphaned` only the departures it had previously discovered.
//
// Pure, and the only way to apply a reconciliation is `applyReconciliation`
// below — the diff and its interpretation live in one file so neither can drift
// from the invariant the other states.

/**
 * One discovered ticket, as the search saw it. The application layer flattens the
 * gateway's raw shape into this, so this module never meets an HTTP response.
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
 * A `blocks` relationship, **normalised to one direction**: Jira reports the same
 * link as `outward` on the blocker and `inward` on the blocked issue and a search
 * returns both ends, so unnormalised, a dependency arrives and is drawn twice.
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
 * type is the schema's own list, so "can sync move a node" is one line to check.
 */
export type MirrorUpdate = {
  readonly nodeId: string
  readonly fields: MirroredFields
}

/**
 * A newly discovered ticket, **flat and undated**: `start` and `end` are `null`
 * literals, not `string | null`, because an addition is never dated (ADR-0012 §4);
 * `orphaned` is `false` and `discovered` `true` because only a search makes one.
 */
export type NodeAddition = Omit<GanttNode, 'start' | 'end' | 'orphaned' | 'discovered'> & {
  readonly start: null
  readonly end: null
  readonly orphaned: false
  readonly discovered: true
}

/** A local edge Jira now reports as a real link: promoted, not duplicated. */
export type EdgePromotion = {
  readonly edgeId: string
  readonly source: Extract<GanttEdgeSource, { kind: 'jira' }>
}

/**
 * The complete output. Seven fields, and the two that could destroy a plan —
 * a node removal and a node reparent — are **absent**, not merely unused.
 */
export type Reconciliation = {
  readonly mirrorUpdates: readonly MirrorUpdate[]
  readonly additions: readonly NodeAddition[]
  /**
   * Every **already-discovered** mirrored node whose key the search did not return
   * — the **set**, not the delta, so a ticket that comes back loses its badge. A
   * node still `discovered: false` is never here, however complete the search.
   */
  readonly orphanedIds: readonly string[]
  /**
   * Node ids whose key **this** search returned. Or-ed in, never assigned, because
   * `discovered` is sticky: dropping out of a later search is orphaning, not
   * un-discovery. Kept even when the search was not authoritative — it argues from
   * presence, where `orphanedIds` argues from absence.
   */
  readonly discoveredIds: readonly string[]
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
  discoveredIds: [],
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
 * Where a newly discovered ticket lands: under its Jira parent when that parent is
 * itself a node — already in the chart, or added by this same reconcile — and at
 * the root otherwise. The **only** time Jira's hierarchy is read, as a suggestion.
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
  mirrorOnly: readonly DiscoveredIssue[],
): Pick<Reconciliation, 'mirrorUpdates' | 'additions' | 'orphanedIds' | 'discoveredIds'> {
  const byKey = new Map(discovered.map((issue) => [issue.key.toUpperCase(), issue]))
  const mirrorOnlyByKey = new Map(mirrorOnly.map((issue) => [issue.key.toUpperCase(), issue]))
  const nodeIdByKey = new Map<string, string>()
  for (const node of chart.nodes) {
    const key = keyOf(node)
    if (key !== null) nodeIdByKey.set(key, node.id)
  }

  const mirrorUpdates: MirrorUpdate[] = []
  const orphanedIds: string[] = []
  const discoveredIds: string[] = []
  for (const node of chart.nodes) {
    const key = keyOf(node)
    if (key === null) continue
    const found = byKey.get(key)
    // Absent from the search is orphaned **only if a search ever returned it**: a
    // key never in scope cannot have departed. Still a real ticket, so still mirrored.
    if (found === undefined && node.discovered) orphanedIds.push(node.id)
    if (found !== undefined) discoveredIds.push(node.id)
    const issue = found ?? mirrorOnlyByKey.get(key)
    if (issue === undefined) continue
    const fields = mirroredOf(issue)
    if (differs(node, fields)) mirrorUpdates.push({ nodeId: node.id, fields })
  }

  // Placement reads the nodes already placed *plus* those placed earlier in this
  // same loop, so a batch import nests a discovered child under its parent.
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
      discovered: true,
      ...mirroredOf(issue),
    })
    nodeIdByKey.set(issue.key.toUpperCase(), id)
    placed.push({ parentId, order })
  }

  return { mirrorUpdates, additions, orphanedIds, discoveredIds }
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
      // The one rule for a local edge: a pair Jira now reports as a real link is
      // **promoted**, drawn once and not twice. Nothing else touches it (§6).
      if (link !== undefined) {
        edgePromotions.push({ edgeId: edge.id, source: { kind: 'jira', linkId: link.linkId } })
      }
      continue
    }
    if (link !== undefined) continue
    // A jira edge whose link the search no longer reports. Removed only when both
    // tickets were looked at: a departed endpoint is absence of evidence, not proof.
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

/**
 * What this chart and this search disagree about, and nothing more. `mirrorOnly`
 * is the tickets sync read **by key** — jira nodes no search returns, such as a
 * gate in another epic. Being no evidence about epic membership, they refresh a
 * node's mirrored half and cannot add one, flip `discovered`, or carry an edge.
 */
export function reconcile(
  chart: GanttChart,
  discovered: readonly DiscoveredIssue[],
  mirrorOnly: readonly DiscoveredIssue[] = [],
): Reconciliation {
  const nodes = reconcileNodes(chart, discovered, mirrorOnly)
  return { ...nodes, ...reconcileEdges(chart, discovered, nodes.additions) }
}

/**
 * The reconciliation applied — the only interpretation of one there is. Every
 * existing node keeps its identity, place, order, dates and body: `refresh` writes
 * the mirrored `fields`, `orphaned` and `discovered`, and a `MirrorUpdate` names
 * nothing else. A local node is not touched — sync has no opinion about a lane the
 * chart is the only copy of.
 */
export function applyReconciliation(chart: GanttChart, change: Reconciliation): GanttChart {
  const updates = new Map(change.mirrorUpdates.map((update) => [update.nodeId, update.fields]))
  const orphaned = new Set(change.orphanedIds)
  const seen = new Set(change.discoveredIds)
  const removed = new Set(change.edgeRemovals)
  const promoted = new Map(change.edgePromotions.map((p) => [p.edgeId, p.source]))

  return {
    ...chart,
    nodes: [
      ...chart.nodes.map((n) => refresh(n, updates.get(n.id), orphaned.has(n.id), seen.has(n.id))),
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
 * A refreshed **copy**: the node off disk is never mutated and a local one is
 * never touched. `orphaned` is **assigned** from the set, so a ticket that returns
 * to its epic loses the badge; `discovered` is **or-ed**, since nothing can make
 * it untrue that a search once returned the key. Nothing else is writable here —
 * `fields` is the whole of a `MirrorUpdate`.
 */
function refresh(
  node: GanttNode,
  fields: MirroredFields | undefined,
  orphaned: boolean,
  discovered: boolean,
): GanttNode {
  const sticky = node.discovered || discovered
  return node.source.kind === 'jira' ? { ...node, ...fields, orphaned, discovered: sticky } : node
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
