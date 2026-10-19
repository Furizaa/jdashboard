import { Schema } from 'effect'

// The failures the Gantt write surface can report, in the `Schema.TaggedError`
// shape every other server context uses.
//
// These errors have an unusual consumer. Everywhere else in the app a tagged
// error becomes a `toWire` envelope read by typed client code; here it becomes a
// **JSON body an agent must self-correct from** (ADR-0012 §9), mapped to an HTTP
// status by `routes/api/-gantt-http.ts`. That is why each one carries the id or
// the field names it is about rather than only a message: the mapping from a
// tag to a status lives in one place, and the detail an agent needs to fix its
// next call rides on the error itself.
//
// There is deliberately no error for a **cycle**. The API never refuses to
// record a dependency someone declared (ADR-0012 §6): a plan that is impossible
// should look impossible, and an agent building a chart incrementally will
// create a cycle it intends to resolve two calls later.

export class ChartNotFound extends Schema.TaggedError<ChartNotFound>()('ChartNotFound', {
  chartId: Schema.String,
}) {}

export class NodeNotFound extends Schema.TaggedError<NodeNotFound>()('NodeNotFound', {
  chartId: Schema.String,
  nodeId: Schema.String,
}) {}

export class EdgeNotFound extends Schema.TaggedError<EdgeNotFound>()('EdgeNotFound', {
  chartId: Schema.String,
  edgeId: Schema.String,
}) {}

/**
 * A chart id that is already taken. Not in the issue's list of errors, and
 * required by its acceptance criteria ("`POST /charts` with a duplicate chart
 * id returns `409`"): reusing `DuplicateNodeId` for a chart would be a lie in
 * the one field an agent reads to decide what to rename.
 */
export class DuplicateChartId extends Schema.TaggedError<DuplicateChartId>()('DuplicateChartId', {
  chartId: Schema.String,
}) {}

export class DuplicateNodeId extends Schema.TaggedError<DuplicateNodeId>()('DuplicateNodeId', {
  chartId: Schema.String,
  nodeId: Schema.String,
}) {}

/**
 * The edge-shaped half of the same rule, and **one tag over two refusals**.
 *
 * An id is a **handle**: a duplicate edge id makes `DELETE /edges/:edgeId`
 * ambiguous, which is why `ganttChartSchema` refuses a chart containing one —
 * and why accepting the write would store a chart the store then reads as
 * absent. But a dependency's *identity* is its **endpoint pair** (ADR-0012 §6,
 * whose promotion rule already says one pair is one edge), so a second edge over
 * a pair the chart already has is the same refusal wearing different clothes:
 * bootstrap mirrors every Jira link, and an agent re-declaring what it read from
 * the epic under ids of its own would otherwise double the graph silently.
 *
 * `edgeId` is always the **incumbent's** id, never the one the caller sent, and
 * `pair` is what separates "already declared — stop" from "name collision —
 * rename and retry". Both are `409`.
 */
export class DuplicateEdgeId extends Schema.TaggedError<DuplicateEdgeId>()('DuplicateEdgeId', {
  chartId: Schema.String,
  edgeId: Schema.String,
  /** Set only for a pair collision; absent for an id collision. */
  pair: Schema.optional(Schema.Struct({ from: Schema.String, to: Schema.String })),
}) {}

/** One field the caller got wrong, in the shape `toIssues` produces. */
const GanttIssueSchema = Schema.Struct({
  path: Schema.String,
  expected: Schema.String,
  received: Schema.String,
})

/**
 * A payload the schema rejected, carrying the `issues[]` an agent self-corrects
 * from. Most decode failures are caught at the route boundary; this error is
 * the application layer's own half — a mutation whose *result* the chart schema
 * would reject never reaches disk, because a chart that fails validation on the
 * way back in reads as absent, and a plan nobody has another copy of must not be
 * able to vanish that way.
 */
export class InvalidChartPayload extends Schema.TaggedError<InvalidChartPayload>()(
  'InvalidChartPayload',
  {
    message: Schema.String,
    issues: Schema.Array(GanttIssueSchema),
  },
) {}

/**
 * A patch naming a field sync owns on a node sync mirrors (ADR-0012 §3). The
 * next sync would overwrite it, so accepting the write would be a lie — and the
 * fields are carried because "which of the four did I touch" is exactly what the
 * agent needs to drop from its next call.
 */
export class MirroredFieldPatch extends Schema.TaggedError<MirroredFieldPatch>()(
  'MirroredFieldPatch',
  {
    chartId: Schema.String,
    nodeId: Schema.String,
    fields: Schema.Array(Schema.String),
  },
) {}

/**
 * Jira did not answer a sync's one search — any of unauthorized, rejected, or a
 * transport failure, because from the caller's side they are one fact: the
 * mirrored half of this chart could not be read just now. A `503`, and the
 * chart is left **byte-identical**: nothing is reconciled from a search that did
 * not happen, since a sync that discovered nothing would mark every mirrored
 * node in the chart `orphaned`.
 *
 * Unlike the rest of this file this is not something the caller got wrong, so
 * it carries only what happened. Retrying later is the whole remedy.
 */
export class JiraUnreachable extends Schema.TaggedError<JiraUnreachable>()('JiraUnreachable', {
  chartId: Schema.String,
  message: Schema.String,
}) {}

/**
 * Every failure a gantt route maps to a status. Declared as a union so the map
 * in `-gantt-http.ts` can be exhaustive: a new error is then a compile error at
 * the one place that decides what the agent sees, rather than a silent `500`.
 */
export type GanttError =
  | ChartNotFound
  | NodeNotFound
  | EdgeNotFound
  | DuplicateChartId
  | DuplicateNodeId
  | DuplicateEdgeId
  | InvalidChartPayload
  | MirroredFieldPatch
  | JiraUnreachable
