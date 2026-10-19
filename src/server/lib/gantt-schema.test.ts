import { describe, expect, it } from 'vitest'
import {
  assertChartId,
  assertNodeId,
  createChartBody,
  createEdgeBody,
  createNodeBody,
  ganttChartSchema,
  patchChartBody,
  patchNodeBody,
  patchTouchesMirroredFields,
  toIssues,
  type GanttChart,
} from './gantt-schema'

// A chart that validates, as the literal JSON an agent would send — not a typed
// object — so that a test for a rejection can break one field without the type
// checker refusing to express the broken state.
function validChart(): Record<string, unknown> {
  return {
    version: 1,
    id: 'tier-migration',
    title: 'Tier migration',
    jiraSources: ['GEO-120'],
    lastSyncedAt: '2026-10-19T09:00:00.000Z',
    createdAt: '2026-10-01T08:00:00.000Z',
    nodes: [
      {
        id: 'prd-tiering',
        parentId: null,
        order: 0,
        title: 'Tiering PRD',
        source: { kind: 'local' },
        start: '2026-10-01',
        end: '2026-12-31',
        column: 'In Implementation',
        status: null,
        assignee: null,
        orphaned: false,
      },
      {
        id: 'geo-412',
        parentId: 'prd-tiering',
        order: 1,
        title: 'Split the pricing service',
        source: { kind: 'jira', key: 'GEO-412' },
        start: null,
        end: null,
        column: 'Done',
        status: 'In STG',
        assignee: 'Andreas Hoffmann',
        orphaned: false,
      },
    ],
    edges: [
      {
        id: 'e1',
        from: 'prd-tiering',
        to: 'geo-412',
        source: { kind: 'local' },
      },
    ],
  }
}

/** The dot-joined paths a rejection complained about, which is what a caller keys off. */
function failedPaths(value: unknown): readonly string[] {
  const result = ganttChartSchema.safeParse(value, { reportInput: true })
  expect(result.success).toBe(false)
  return result.success ? [] : toIssues(result.error).map((issue) => issue.path)
}

describe('ganttChartSchema', () => {
  it('parses a valid chart', () => {
    const result = ganttChartSchema.safeParse(validChart())
    expect(result.success).toBe(true)
    const chart = result.data as GanttChart
    expect(chart.nodes).toHaveLength(2)
    expect(chart.nodes[1]?.source).toEqual({ kind: 'jira', key: 'GEO-412' })
    expect(chart.edges[0]?.from).toBe('prd-tiering')
  })

  it('parses a chart with no nodes, no edges and no sources — the empty new chart', () => {
    const chart = validChart()
    chart.jiraSources = []
    chart.nodes = []
    chart.edges = []
    chart.lastSyncedAt = null
    expect(ganttChartSchema.safeParse(chart).success).toBe(true)
  })

  it('accepts an undated node, because import creates forty of them', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[0]!.start = null
    ;(chart.nodes as Record<string, unknown>[])[0]!.end = null
    expect(ganttChartSchema.safeParse(chart).success).toBe(true)
  })

  it('rejects a node id that is not a slug', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[0]!.id = 'Tier Migration'
    expect(failedPaths(chart)).toContain('nodes.0.id')
  })

  it('rejects a date that is not YYYY-MM-DD', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[0]!.start = 'next week'
    expect(failedPaths(chart)).toContain('nodes.0.start')
  })

  it('rejects an impossible calendar month', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[0]!.end = '2026-13-01'
    expect(failedPaths(chart)).toContain('nodes.0.end')
  })

  it('rejects an unknown source kind', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[1]!.source = { kind: 'gitlab', key: 'GEO-412' }
    // The discriminator is the field that is wrong, and the union says so.
    expect(failedPaths(chart)).toContain('nodes.1.source.kind')
  })

  it('rejects a jira source with no key', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[1]!.source = { kind: 'jira' }
    expect(failedPaths(chart)).toContain('nodes.1.source.key')
  })

  it('rejects a version other than 1', () => {
    const chart = validChart()
    chart.version = 2
    expect(failedPaths(chart)).toContain('version')
  })

  it('rejects a column outside the kernel vocabulary', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[0]!.column = 'Blocked'
    expect(failedPaths(chart)).toContain('nodes.0.column')
  })

  it('rejects an edge whose from is absent from nodes', () => {
    const chart = validChart()
    ;(chart.edges as Record<string, unknown>[])[0]!.from = 'prd-nowhere'
    expect(failedPaths(chart)).toContain('edges.0.from')
  })

  it('rejects an edge whose to is absent from nodes', () => {
    const chart = validChart()
    ;(chart.edges as Record<string, unknown>[])[0]!.to = 'prd-nowhere'
    expect(failedPaths(chart)).toContain('edges.0.to')
  })

  it('rejects two nodes claiming one id', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[1]!.id = 'prd-tiering'
    expect(failedPaths(chart)).toContain('nodes.1.id')
  })

  it('rejects two edges claiming one id', () => {
    const chart = validChart()
    const edges = chart.edges as Record<string, unknown>[]
    chart.edges = [edges[0], { ...edges[0], from: 'geo-412', to: 'prd-tiering' }]
    expect(failedPaths(chart)).toContain('edges.1.id')
  })

  it('accepts a cycle rather than refusing to record a declared dependency', () => {
    const chart = validChart()
    chart.edges = [
      { id: 'e1', from: 'prd-tiering', to: 'geo-412', source: { kind: 'local' } },
      { id: 'e2', from: 'geo-412', to: 'prd-tiering', source: { kind: 'local' } },
    ]
    expect(ganttChartSchema.safeParse(chart).success).toBe(true)
  })
})

describe('toIssues', () => {
  it('names every failure with a dot-joined path, an expected and a received', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[0]!.start = 'next week'
    ;(chart.nodes as Record<string, unknown>[])[1]!.order = 'second'
    const result = ganttChartSchema.safeParse(chart, { reportInput: true })
    expect(result.success).toBe(false)
    const issues = result.success ? [] : toIssues(result.error)

    expect(issues).toHaveLength(2)
    expect(issues).toContainEqual({
      path: 'nodes.0.start',
      expected: 'string matching /^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$/u',
      received: '"next week"',
    })
    expect(issues).toContainEqual({
      path: 'nodes.1.order',
      expected: 'number',
      received: '"second"',
    })
  })

  it('reports a missing field as received undefined', () => {
    const chart = validChart()
    delete (chart.nodes as Record<string, unknown>[])[0]!.title
    const result = ganttChartSchema.safeParse(chart, { reportInput: true })
    const issues = result.success ? [] : toIssues(result.error)
    expect(issues).toContainEqual({
      path: 'nodes.0.title',
      expected: 'string',
      received: 'undefined',
    })
  })

  it('names the enum options as expected for a bad column', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[0]!.column = 'Blocked'
    const result = ganttChartSchema.safeParse(chart, { reportInput: true })
    const issues = result.success ? [] : toIssues(result.error)
    const column = issues.find((issue) => issue.path === 'nodes.0.column')
    expect(column?.expected).toBe('"TO DO" | "In Implementation" | "In Code Review" | "Done"')
    expect(column?.received).toBe('"Blocked"')
  })

  it('carries the refinement message for a chart-level invariant', () => {
    const chart = validChart()
    ;(chart.edges as Record<string, unknown>[])[0]!.from = 'prd-nowhere'
    const result = ganttChartSchema.safeParse(chart, { reportInput: true })
    const issues = result.success ? [] : toIssues(result.error)
    expect(issues).toContainEqual({
      path: 'edges.0.from',
      expected: 'edge from "prd-nowhere" is not a node in this chart',
      received: 'object',
    })
  })

  it('reads `received` as unknown when the parse did not report the input', () => {
    const chart = validChart()
    chart.version = 2
    const result = ganttChartSchema.safeParse(chart)
    const issues = result.success ? [] : toIssues(result.error)
    expect(issues).toContainEqual({ path: 'version', expected: '1', received: 'unknown' })
  })

  it('reports the root path for a value that is not an object at all', () => {
    const result = ganttChartSchema.safeParse('a chart, surely', { reportInput: true })
    const issues = result.success ? [] : toIssues(result.error)
    expect(issues).toEqual([{ path: '(root)', expected: 'object', received: '"a chart, surely"' }])
  })

  it('truncates a long received value rather than echoing it whole', () => {
    const chart = validChart()
    ;(chart.nodes as Record<string, unknown>[])[0]!.start = 'x'.repeat(200)
    const result = ganttChartSchema.safeParse(chart, { reportInput: true })
    const issues = result.success ? [] : toIssues(result.error)
    const start = issues.find((issue) => issue.path === 'nodes.0.start')
    expect(start?.received).toHaveLength(42)
    expect(start?.received.endsWith('…"')).toBe(true)
  })
})

describe('assertChartId / assertNodeId', () => {
  const accepted = ['tier-migration', 'geo-412', 'a', '0', 'a'.repeat(64)]
  const rejected = ['../escape', 'Tier', '-leading', 'a'.repeat(65), '', 'has space', 'dot.ted']

  it.each(accepted)('accepts %j as a chart id', (value) => {
    expect(assertChartId(value, 'test')).toBe(value)
  })

  it.each(accepted)('accepts %j as a node id', (value) => {
    expect(assertNodeId(value, 'test')).toBe(value)
  })

  it.each(rejected)('rejects %j as a chart id', (value) => {
    expect(() => assertChartId(value, 'chartDir')).toThrow(/chartDir: invalid chart id/u)
  })

  it.each(rejected)('rejects %j as a node id', (value) => {
    expect(() => assertNodeId(value, 'bodyFilePath')).toThrow(/bodyFilePath: invalid node id/u)
  })
})

describe('request bodies', () => {
  it('createChartBody defaults jiraSources to the empty list', () => {
    const parsed = createChartBody.parse({ id: 'tier-migration', title: 'Tier migration' })
    expect(parsed).toEqual({ id: 'tier-migration', title: 'Tier migration', jiraSources: [] })
  })

  it('createChartBody rejects an id that is not a slug', () => {
    expect(createChartBody.safeParse({ id: 'Tier Migration', title: 'x' }).success).toBe(false)
  })

  it('createNodeBody fills every chart-owned field an agent left out', () => {
    expect(createNodeBody.parse({ id: 'prd-tiering', title: 'Tiering PRD' })).toEqual({
      id: 'prd-tiering',
      parentId: null,
      order: 0,
      title: 'Tiering PRD',
      source: { kind: 'local' },
      start: null,
      end: null,
      column: 'TO DO',
      status: null,
      assignee: null,
    })
  })

  it('createNodeBody does not let a caller claim a node is orphaned', () => {
    const parsed = createNodeBody.parse({ id: 'n', title: 't', orphaned: true })
    expect('orphaned' in parsed).toBe(false)
  })

  it('createEdgeBody defaults to a local edge', () => {
    expect(createEdgeBody.parse({ id: 'e1', from: 'a', to: 'b' }).source).toEqual({
      kind: 'local',
    })
  })

  it('patchChartBody accepts a title-only patch and rejects an id', () => {
    expect(patchChartBody.parse({ title: 'Renamed' })).toEqual({ title: 'Renamed' })
    expect('id' in patchChartBody.parse({ id: 'other', title: 'Renamed' })).toBe(false)
  })

  it('patchNodeBody carries no id and no source — neither is patchable', () => {
    const parsed = patchNodeBody.parse({ id: 'other', source: { kind: 'local' }, order: 3 })
    expect(parsed).toEqual({ order: 3 })
  })

  it.each([
    [{ title: 'Renamed' }, true],
    [{ column: 'Done' as const }, true],
    [{ status: 'In STG' }, true],
    [{ assignee: 'Someone' }, true],
    [{ assignee: null }, true],
    [{ start: '2026-11-01' }, false],
    [{ parentId: 'prd-tiering' }, false],
    [{ order: 2 }, false],
    [{}, false],
  ])('patchTouchesMirroredFields(%j) is %s', (body, expected) => {
    expect(patchTouchesMirroredFields(patchNodeBody.parse(body))).toBe(expected)
  })
})
