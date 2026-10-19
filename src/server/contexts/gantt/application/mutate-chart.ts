import { Effect } from 'effect'
import {
  GANTT_CHART_VERSION,
  MIRRORED_NODE_FIELDS,
  ganttChartSchema,
  patchTouchesMirroredFields,
  toIssues,
  type CreateChartBody,
  type CreateEdgeBody,
  type CreateNodeBody,
  type GanttChart,
  type GanttEdge,
  type GanttNode,
  type PatchChartBody,
  type PatchNodeBody,
} from '../../../lib/gantt-schema'
import { readBody, readChart, writeBody, writeChart } from '../../../lib/gantt-store'
import { deleteBodyFiles, recordChange, type GanttWrites } from '../../../lib/gantt-writes'
import {
  ChartNotFound,
  DuplicateChartId,
  DuplicateEdgeId,
  DuplicateNodeId,
  EdgeNotFound,
  InvalidChartPayload,
  MirroredFieldPatch,
  NodeNotFound,
} from '../errors'

// The write use-cases: everything an agent can do to a chart, each one a single
// read-modify-write inside `withChartLock` with exactly one changelog entry
// appended in the same critical section.
//
// Two consumers, one service (ADR-0006, ADR-0012 §7): the REST routes an agent
// drives, and — for sync and the lifecycle verbs — the UI's server functions.
// Neither layer may import the other, so the use-case lives here. Every refusal
// is a **tagged error**, never a thrown one, because the consumer is an agent
// that has to correct its next call from what comes back.

/**
 * What one critical section produced. The lock is promise-shaped, so a refusal
 * travels back as a value and `locked` lifts it into the error channel — thrown,
 * it would be a defect and a `500` for an ordinary, correctable `409`.
 */
type Outcome<A, E> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: E }

const ok = <A>(value: A): Outcome<A, never> => ({ ok: true, value })
const no = <E>(error: E): Outcome<never, E> => ({ ok: false, error })

// One alias per use-case, so each signature says what it can refuse without the
// reader unpicking a four-arm union twice over.
type CreateChartError = DuplicateChartId | InvalidChartPayload
type PatchChartError = ChartNotFound | InvalidChartPayload
type CreateNodeError = ChartNotFound | DuplicateNodeId | NodeNotFound | InvalidChartPayload
type PatchNodeError = ChartNotFound | NodeNotFound | MirroredFieldPatch | InvalidChartPayload
type DeleteNodeError = ChartNotFound | NodeNotFound | InvalidChartPayload
type PutBodyError = ChartNotFound | NodeNotFound
type CreateEdgeError = ChartNotFound | DuplicateEdgeId | NodeNotFound | InvalidChartPayload
type DeleteEdgeError = ChartNotFound | EdgeNotFound | InvalidChartPayload

function locked<A, E>(
  writes: GanttWrites,
  chartId: string,
  critical: () => Promise<Outcome<A, E>>,
): Effect.Effect<A, E> {
  // `Effect.promise`, not `tryPromise`: a rejection here is a filesystem failure,
  // which is a defect and a logged `500`, not something an agent can fix.
  return Effect.promise(() => writes.withChartLock(chartId, critical)).pipe(
    Effect.flatMap((outcome) =>
      outcome.ok ? Effect.succeed(outcome.value) : Effect.fail(outcome.error),
    ),
  )
}

/**
 * Persist the chart and record what was done to it, in that order, inside the
 * caller's critical section. The schema check guards the system of record:
 * `readChart` treats an invalid `chart.json` as **absent**, so a mutation that
 * wrote a chart the schema rejects would not corrupt the chart — it would make it
 * disappear, which a plan nobody has another copy of must not be able to do.
 */
async function commit(
  writes: GanttWrites,
  chart: GanttChart,
  summary: string,
): Promise<Outcome<GanttChart, InvalidChartPayload>> {
  const result = ganttChartSchema.safeParse(chart, { reportInput: true })
  if (!result.success) {
    return no(
      new InvalidChartPayload({
        message: 'the write would have left the chart invalid, so nothing was written',
        issues: toIssues(result.error),
      }),
    )
  }
  await writeChart(result.data, writes.deps)
  await recordChange(writes, chart.id, 'agent', summary)
  return ok(result.data)
}

/** The chart, or the 404 every use-case but `createChart` starts with. */
async function load(
  writes: GanttWrites,
  chartId: string,
): Promise<Outcome<GanttChart, ChartNotFound>> {
  const chart = await readChart(chartId, writes.deps)
  return chart === null ? no(new ChartNotFound({ chartId })) : ok(chart)
}

const nodeIn = (chart: GanttChart, nodeId: string): GanttNode | undefined =>
  chart.nodes.find((node) => node.id === nodeId)

/** The keys a patch actually set, for the changelog line. */
function changedFields(body: Record<string, unknown>): string[] {
  const named = Object.keys(body).filter((key) => body[key] !== undefined)
  return named.length === 0 ? ['nothing'] : named
}

/** A patch's set keys only: `{ start: undefined }` must not blank a date. */
function definedOnly(body: PatchNodeBody): Partial<GanttNode> {
  const entries = Object.entries(body).filter(([, value]) => value !== undefined)
  return Object.fromEntries(entries) as Partial<GanttNode>
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/**
 * `POST /charts`. `jiraSources` is stored but not yet discovered from — the
 * bootstrap that fills a chart with one mirrored node per discovered ticket is
 * slice 95, and shares this code path rather than adding an `import` verb.
 */
export function createChart(
  body: CreateChartBody,
  writes: GanttWrites,
): Effect.Effect<GanttChart, CreateChartError> {
  return locked<GanttChart, CreateChartError>(writes, body.id, async () => {
    if ((await readChart(body.id, writes.deps)) !== null) {
      return no(new DuplicateChartId({ chartId: body.id }))
    }
    const chart: GanttChart = {
      version: GANTT_CHART_VERSION,
      id: body.id,
      title: body.title,
      jiraSources: body.jiraSources,
      lastSyncedAt: null,
      createdAt: writes.deps.now(),
      nodes: [],
      edges: [],
    }
    return commit(writes, chart, `created chart "${chart.id}" — ${chart.title}`)
  })
}

/** `PATCH /charts/:chartId`. Title and `jiraSources` only; §8 keeps the rest. */
export function patchChart(
  chartId: string,
  body: PatchChartBody,
  writes: GanttWrites,
): Effect.Effect<GanttChart, PatchChartError> {
  return locked<GanttChart, PatchChartError>(writes, chartId, async () => {
    const loaded = await load(writes, chartId)
    if (!loaded.ok) return loaded
    const next: GanttChart = {
      ...loaded.value,
      title: body.title ?? loaded.value.title,
      jiraSources: body.jiraSources ?? loaded.value.jiraSources,
    }
    return commit(writes, next, `patched the chart: ${changedFields(body).join(', ')}`)
  })
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export function createNode(
  chartId: string,
  body: CreateNodeBody,
  writes: GanttWrites,
): Effect.Effect<GanttNode, CreateNodeError> {
  return locked<GanttNode, CreateNodeError>(writes, chartId, async () => {
    const loaded = await load(writes, chartId)
    if (!loaded.ok) return loaded
    const chart = loaded.value
    if (nodeIn(chart, body.id) !== undefined) {
      return no(new DuplicateNodeId({ chartId, nodeId: body.id }))
    }
    // A parent that is not there is a lane the tree cannot place, and a mistyped
    // one should be heard about now rather than when the lane never appears.
    if (body.parentId !== null && nodeIn(chart, body.parentId) === undefined) {
      return no(new NodeNotFound({ chartId, nodeId: body.parentId }))
    }
    // `orphaned` is absent from the body on purpose: a fact sync observes about a
    // Jira key, not a claim a caller gets to make.
    const node: GanttNode = { ...body, orphaned: false }
    const committed = await commit(
      writes,
      { ...chart, nodes: [...chart.nodes, node] },
      `created node "${node.id}" (${node.source.kind}) under ${node.parentId ?? 'the root'}`,
    )
    return committed.ok ? ok(node) : committed
  })
}

export function patchNode(
  chartId: string,
  nodeId: string,
  body: PatchNodeBody,
  writes: GanttWrites,
): Effect.Effect<GanttNode, PatchNodeError> {
  return locked<GanttNode, PatchNodeError>(writes, chartId, async () => {
    const loaded = await load(writes, chartId)
    if (!loaded.ok) return loaded
    const chart = loaded.value
    const node = nodeIn(chart, nodeId)
    if (node === undefined) return no(new NodeNotFound({ chartId, nodeId }))
    // The half `gantt-schema.ts` could not express: *which* fields are mirrored is
    // a property of the schema, but whether **this node's** are depends on the
    // target node's source, which no body schema can look up (ADR-0012 §3). The
    // next sync would overwrite the write, so accepting it would be a lie.
    if (node.source.kind === 'jira' && patchTouchesMirroredFields(body)) {
      return no(
        new MirroredFieldPatch({
          chartId,
          nodeId,
          fields: MIRRORED_NODE_FIELDS.filter((field) => body[field] !== undefined),
        }),
      )
    }
    const newParent = body.parentId
    if (newParent !== undefined && newParent !== null && nodeIn(chart, newParent) === undefined) {
      return no(new NodeNotFound({ chartId, nodeId: newParent }))
    }
    const patched: GanttNode = { ...node, ...definedOnly(body) }
    const committed = await commit(
      writes,
      { ...chart, nodes: chart.nodes.map((n) => (n.id === nodeId ? patched : n)) },
      `patched node "${nodeId}": ${changedFields(body).join(', ')}`,
    )
    return committed.ok ? ok(patched) : committed
  })
}

export type DeleteNodeOk = {
  readonly chartId: string
  readonly nodeId: string
  /** Where this node's children went: its own parent, or the root. */
  readonly reparentedTo: string | null
  readonly reparentedChildIds: readonly string[]
  readonly removedEdgeIds: readonly string[]
}

/**
 * Children are **reparented** to the deleted node's own parent — neither cascaded
 * nor orphaned: a cascade would make one mistyped id delete a subtree of PRDs, and
 * an orphan is a lane the tree cannot place. Every edge touching the node goes
 * too, as do its body and its `.prev`.
 */
export function deleteNode(
  chartId: string,
  nodeId: string,
  writes: GanttWrites,
): Effect.Effect<DeleteNodeOk, DeleteNodeError> {
  return locked<DeleteNodeOk, DeleteNodeError>(writes, chartId, async () => {
    const loaded = await load(writes, chartId)
    if (!loaded.ok) return loaded
    const chart = loaded.value
    const node = nodeIn(chart, nodeId)
    if (node === undefined) return no(new NodeNotFound({ chartId, nodeId }))

    const children = chart.nodes.filter((n) => n.parentId === nodeId)
    const removedEdges = chart.edges.filter((e) => e.from === nodeId || e.to === nodeId)
    const next: GanttChart = {
      ...chart,
      nodes: chart.nodes
        .filter((n) => n.id !== nodeId)
        // A reparented copy; mutating the node read off disk would be a write
        // nobody asked for.
        // oxlint-disable-next-line no-map-spread -- see comment above
        .map((n) => (n.parentId === nodeId ? { ...n, parentId: node.parentId } : n)),
      edges: chart.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    }
    const committed = await commit(
      writes,
      next,
      `deleted node "${nodeId}", reparenting ${children.length} child(ren) to ` +
        `${node.parentId ?? 'the root'} and removing ${removedEdges.length} edge(s)`,
    )
    if (!committed.ok) return committed
    // After the chart, so a failure to erase a file cannot leave a chart that
    // still names the node.
    await deleteBodyFiles(writes, chartId, nodeId)
    return ok({
      chartId,
      nodeId,
      reparentedTo: node.parentId,
      reparentedChildIds: children.map((n) => n.id),
      removedEdgeIds: removedEdges.map((e) => e.id),
    } satisfies DeleteNodeOk)
  })
}

export type PutBodyOk = {
  readonly chartId: string
  readonly nodeId: string
  /** Whether a predecessor was kept as `<nodeId>.md.prev` — the one level of undo. */
  readonly snapshotted: boolean
}

/**
 * Goes through the store's `writeBody`, so the predecessor is snapshotted to
 * `<nodeId>.md.prev` (ADR-0012 §11). The chart itself does not change, so there is
 * nothing to commit; the changelog entry is appended here instead, still inside
 * the lock, so a body write is as audited as a field write.
 */
export function putBody(
  chartId: string,
  nodeId: string,
  markdown: string,
  writes: GanttWrites,
): Effect.Effect<PutBodyOk, PutBodyError> {
  return locked<PutBodyOk, PutBodyError>(writes, chartId, async () => {
    const loaded = await load(writes, chartId)
    if (!loaded.ok) return loaded
    if (nodeIn(loaded.value, nodeId) === undefined) {
      return no(new NodeNotFound({ chartId, nodeId }))
    }
    const snapshotted = (await readBody(chartId, nodeId, writes.deps)) !== null
    await writeBody(chartId, nodeId, markdown, writes.deps)
    await recordChange(
      writes,
      chartId,
      'agent',
      `wrote the body of node "${nodeId}" (${markdown.length} characters)` +
        (snapshotted ? ', keeping the previous one as .md.prev' : ''),
    )
    return ok({ chartId, nodeId, snapshotted } satisfies PutBodyOk)
  })
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/**
 * An edge that closes a **cycle is accepted**: the API never refuses to record a
 * dependency someone declared (ADR-0012 §6). A plan that is impossible should look
 * impossible rather than be impossible to write down.
 */
export function createEdge(
  chartId: string,
  body: CreateEdgeBody,
  writes: GanttWrites,
): Effect.Effect<GanttEdge, CreateEdgeError> {
  return locked<GanttEdge, CreateEdgeError>(writes, chartId, async () => {
    const loaded = await load(writes, chartId)
    if (!loaded.ok) return loaded
    const chart = loaded.value
    if (chart.edges.some((edge) => edge.id === body.id)) {
      return no(new DuplicateEdgeId({ chartId, edgeId: body.id }))
    }
    for (const end of [body.from, body.to]) {
      if (nodeIn(chart, end) === undefined) {
        return no(new NodeNotFound({ chartId, nodeId: end }))
      }
    }
    const edge: GanttEdge = { ...body }
    const committed = await commit(
      writes,
      { ...chart, edges: [...chart.edges, edge] },
      `created edge "${edge.id}": "${edge.from}" blocks "${edge.to}"`,
    )
    return committed.ok ? ok(edge) : committed
  })
}

export function deleteEdge(
  chartId: string,
  edgeId: string,
  writes: GanttWrites,
): Effect.Effect<GanttEdge, DeleteEdgeError> {
  return locked<GanttEdge, DeleteEdgeError>(writes, chartId, async () => {
    const loaded = await load(writes, chartId)
    if (!loaded.ok) return loaded
    const chart = loaded.value
    const edge = chart.edges.find((candidate) => candidate.id === edgeId)
    if (edge === undefined) return no(new EdgeNotFound({ chartId, edgeId }))
    const committed = await commit(
      writes,
      { ...chart, edges: chart.edges.filter((candidate) => candidate.id !== edgeId) },
      `deleted edge "${edgeId}": "${edge.from}" no longer blocks "${edge.to}"`,
    )
    return committed.ok ? ok(edge) : committed
  })
}
