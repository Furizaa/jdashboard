import type { Column, GanttChart, GanttEdge, GanttNode, GanttNodeSource } from '~/kernel'

// One chart that exercises every case the surface has to draw, in one place.
//
// Slice 97's snapshots read it, this slice's manual verification writes it to
// `~/.clashboard/gantt/demo-pricing-rework/chart.json` and opens it in a browser,
// and anything new the renderer has to handle gets a lane here rather than a
// second fixture — the point of one world is that a case cannot be covered in
// the tests and missing from the thing a human looks at.
//
// What it covers, each named where it is built below:
//
//   - **three depths** — a PRD, its features, their tickets;
//   - **a dated parent whose children overrun it** — `tier-migration` declares
//     a window ending 15 Nov and `pricing-ui` runs to 28 Nov, so the derived
//     child span underlay shows the overrun (ADR-0012 §4);
//   - **an undated node** — `rate-cards`, a lane with no dates and so no bar;
//   - **a cross-depth arrow** — `geo-142` (depth 2) blocks `invoice-rewrite`
//     (depth 1);
//   - **three arrows that merge under collapse** — three edges from the
//     `tier-migration` subtree into the `billing-cutover` subtree, which
//     re-anchor onto one PRD-level pair with a count of 3;
//   - **an arrow that is dropped under collapse** — `geo-141` blocks `geo-142`,
//     two children of one parent, so collapsing `pricing-api` makes it a
//     self-loop;
//   - **a cycle** — `dunning` and `shutdown-reads` each block the other, which
//     the warning names and the arrows draw distinctly;
//   - **an orphaned node** — `geo-150`, a ticket that left its epic;
//   - **a node nobody placed** — `geo-200`, a childless jira lane still sitting
//     at the root where import dropped it.
//
// Dates are a quarter wide on purpose: the extent is just over three months, so
// the chart opens at **month** zoom and both other zooms are worth switching to.

type NodeSpec = {
  readonly parentId?: string | null
  readonly order?: number
  readonly title: string
  readonly start?: string | null
  readonly end?: string | null
  readonly column?: Column
  readonly source?: GanttNodeSource
  readonly status?: string | null
  readonly assignee?: string | null
  readonly orphaned?: boolean
}

function node(id: string, spec: NodeSpec): GanttNode {
  return {
    id,
    parentId: spec.parentId ?? null,
    order: spec.order ?? 0,
    title: spec.title,
    source: spec.source ?? { kind: 'local' },
    start: spec.start ?? null,
    end: spec.end ?? null,
    column: spec.column ?? 'TO DO',
    status: spec.status ?? null,
    assignee: spec.assignee ?? null,
    orphaned: spec.orphaned ?? false,
  }
}

/** A mirrored ticket: its title, column, status and assignee are sync's (ADR-0012 §3). */
function jira(id: string, key: string, spec: Omit<NodeSpec, 'source'>): GanttNode {
  return node(id, { ...spec, source: { kind: 'jira', key } })
}

/** `a>b` reads "a blocks b", which is what every edge means. */
function edge(spec: string): GanttEdge {
  const [from = '', to = ''] = spec.split('>')
  return { id: `${from}-blocks-${to}`, from, to, source: { kind: 'local' } }
}

const NODES: readonly GanttNode[] = [
  // Depth 0, 1 and 2 under one PRD. Its declared window ends 15 Nov.
  node('tier-migration', {
    order: 0,
    title: 'Tier migration',
    start: '2026-10-05',
    end: '2026-11-15',
    column: 'In Implementation',
  }),
  node('pricing-api', {
    parentId: 'tier-migration',
    order: 0,
    title: 'Pricing API v2',
    start: '2026-10-05',
    end: '2026-10-24',
    column: 'In Code Review',
  }),
  jira('geo-141', 'GEO-141', {
    parentId: 'pricing-api',
    order: 0,
    title: 'Quote endpoint returns tiers',
    start: '2026-10-05',
    end: '2026-10-14',
    column: 'Done',
    status: 'Done',
    assignee: 'Andreas Hoffmann',
  }),
  jira('geo-142', 'GEO-142', {
    parentId: 'pricing-api',
    order: 1,
    title: 'Tier lookup is cached per region',
    start: '2026-10-15',
    end: '2026-10-24',
    column: 'In Code Review',
    status: 'In Code Review',
    assignee: 'Andreas Hoffmann',
  }),
  // The overrun: this feature runs thirteen days past its PRD's declared end.
  node('pricing-ui', {
    parentId: 'tier-migration',
    order: 1,
    title: 'Pricing UI rework',
    start: '2026-10-25',
    end: '2026-11-28',
  }),
  jira('geo-143', 'GEO-143', {
    parentId: 'pricing-ui',
    order: 0,
    title: 'Tier selector on the quote form',
    start: '2026-10-25',
    end: '2026-11-10',
    column: 'In Implementation',
    status: 'In Implementation',
    assignee: 'Lena Fischer',
  }),
  jira('geo-144', 'GEO-144', {
    parentId: 'pricing-ui',
    order: 1,
    title: 'Price breakdown drawer',
    start: '2026-11-11',
    end: '2026-11-28',
    status: 'Reviewed',
  }),
  // Undated: a lane that exists in the plan and has no dates yet.
  node('rate-cards', { parentId: 'tier-migration', order: 2, title: 'Rate cards are data' }),

  // The second PRD, the other end of every merged arrow.
  node('billing-cutover', {
    order: 1,
    title: 'Billing cutover',
    start: '2026-11-01',
    end: '2026-12-20',
  }),
  node('invoice-rewrite', {
    parentId: 'billing-cutover',
    order: 0,
    title: 'Invoice lines carry the tier',
    start: '2026-11-01',
    end: '2026-11-30',
  }),
  node('dunning', {
    parentId: 'billing-cutover',
    order: 1,
    title: 'Dunning reads the new schedule',
    start: '2026-12-01',
    end: '2026-12-20',
  }),
  // Orphaned: this ticket left the epic, so it is marked rather than removed.
  jira('geo-150', 'GEO-150', {
    parentId: 'billing-cutover',
    order: 2,
    title: 'Legacy invoice importer',
    start: '2026-11-05',
    end: '2026-11-20',
    column: 'In Implementation',
    status: 'In Implementation',
    assignee: 'Sam Okonkwo',
    orphaned: true,
  }),

  // The third PRD, one half of the cycle.
  node('legacy-sunset', {
    order: 2,
    title: 'Legacy pricing sunset',
    start: '2026-12-01',
    end: '2027-01-15',
  }),
  node('shutdown-reads', {
    parentId: 'legacy-sunset',
    order: 0,
    title: 'Stop reading the legacy table',
    start: '2026-12-01',
    end: '2026-12-20',
  }),

  // Unplaced: a childless jira lane still at the root, where import left it.
  jira('geo-200', 'GEO-200', { order: 3, title: 'Audit tier rounding', status: 'Reviewed' }),
]

const EDGES: readonly GanttEdge[] = [
  // Cross-depth, and the first of the three that merge under collapse.
  'geo-142>invoice-rewrite',
  'pricing-ui>dunning',
  'pricing-api>geo-150',
  // Two children of one parent: a self-loop once that parent is collapsed.
  'geo-141>geo-142',
  // The cycle, which the API records and the chart reports (ADR-0012 §6).
  'dunning>shutdown-reads',
  'shutdown-reads>dunning',
].map(edge)

export const DEMO_CHART_ID = 'demo-pricing-rework'

export const demoChart: GanttChart = {
  version: 1,
  id: DEMO_CHART_ID,
  title: 'Pricing rework',
  // Fake epic keys, deliberately: every test that touches sync does so against a
  // faked gateway. Note the hazard if you ever write this fixture to a real
  // `~/.clashboard/gantt/<id>/` while a dev server is up — the stale-on-open
  // trigger will sync it against *real* Jira, find nothing behind these keys, and
  // (before the `authoritative` guard in `sync-chart.ts`) orphan every mirrored
  // node. The on-disk demo chart therefore carries no sources at all.
  jiraSources: ['GEO-120', 'GEO-130'],
  lastSyncedAt: '2026-10-19T07:30:00.000Z',
  createdAt: '2026-10-01T09:00:00.000Z',
  nodes: [...NODES],
  edges: [...EDGES],
}

/**
 * The bodies that go beside the chart, keyed by node id. Two lanes have a PRD
 * and the rest have nothing, which is the ratio a real chart has — `hasBody` is
 * derived from the presence of the file, so a fixture where every lane had one
 * would never exercise the row that has none.
 */
export const DEMO_CHART_BODIES: Readonly<Record<string, string>> = {
  'tier-migration': [
    '# Tier migration',
    '',
    'Pricing moves from one flat rate to **four tiers**, and every surface that',
    'quotes a price has to learn the difference.',
    '',
    '## Why now',
    '',
    'The flat rate is the reason three of the last five enterprise deals needed a',
    'manual discount. Tiers make the discount a product decision rather than a',
    'spreadsheet one.',
    '',
    '## Shape',
    '',
    '| Step | Owner | State |',
    '| --- | --- | --- |',
    '| Quote endpoint | API | done |',
    '| Regional cache | API | in review |',
    '| Selector | Web | started |',
    '| Breakdown drawer | Web | not started |',
    '',
    '## Out of scope',
    '',
    '- Writing tiers back to the legacy price book.',
    '- Per-customer overrides — a separate PRD once tiers land.',
    '',
    '> The billing cutover waits on the regional cache, and nothing else here.',
  ].join('\n'),
  'billing-cutover': [
    '# Billing cutover',
    '',
    'Invoices start carrying the tier they were priced at, which means the',
    'invoice line grows a field and dunning reads a different schedule.',
    '',
    '## Sequence',
    '',
    '1. Invoice lines carry the tier.',
    '2. Dunning reads the new schedule.',
    '3. The legacy importer is retired.',
    '',
    '`GEO-150` left the epic and is marked rather than removed — it still carries',
    'the dates and the placement that were chosen for it.',
  ].join('\n'),
}
