import { beforeAll, describe, expect, it, vi } from 'vitest'
import { bodyFilePath, bodyPrevFilePath } from '~/server/lib/gantt-store'
import { createGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import {
  aChart,
  anEdge,
  aNode,
  FAKE_HOME,
  fakeGanttStore,
  seedChart,
} from '~/server/contexts/gantt/application/__fixtures__/fake-gantt-store'
import { ganttChartHandlers } from './gantt.charts.$chartId'
import { ganttChartsHandlers } from './gantt.charts'
import { ganttEdgeHandlers } from './gantt.charts.$chartId.edges.$edgeId'
import { ganttEdgesHandlers } from './gantt.charts.$chartId.edges'
import { ganttNodeBodyHandlers } from './gantt.charts.$chartId.nodes.$nodeId.body'
import { ganttNodeHandlers } from './gantt.charts.$chartId.nodes.$nodeId'
import { ganttNodesHandlers } from './gantt.charts.$chartId.nodes'
import { ganttDatesHandlers } from './gantt.charts.$chartId.dates'
import { ganttSyncHandlers } from './gantt.charts.$chartId.sync'
import { ganttFailureResponse } from './-gantt-http'
import { JiraUnreachable } from '~/server/contexts/gantt/errors'

// Named with the `-` prefix so TanStack's route generator does not look for a
// `Route` export in it — the convention `-explain-stream.test.ts` established,
// which is also the route-handler unit-test precedent ADR-0006 names.
//
// The handlers are driven directly, as functions over a fake disk, rather than
// through a server. One case per status code, plus the two assertions that are
// about absence rather than behaviour: that **no route handles
// `DELETE /api/gantt/charts/:chartId`**, and that **no failure path returns a
// plain-text body**.

// `ganttRespond` runs its program on `appRuntime`, which builds the whole
// application layer on first use — including `ServerEnvLive`, which throws on a
// missing variable. Nothing under test needs any of it, so the values are
// placeholders; what matters is that the layer can be built at all.
beforeAll(() => {
  for (const [key, value] of Object.entries({
    JIRA_BASE_URL: 'https://example.atlassian.net',
    JIRA_EMAIL: 'someone@example.com',
    JIRA_API_TOKEN: 'token',
    JIRA_PROJECT_KEY: 'GEO',
    JIRA_LABEL_FILTER: 'team',
    JIRA_DONE_WINDOW_DAYS: '14',
    GITLAB_BASE_URL: 'https://gitlab.example.com',
    GITLAB_TOKEN: 'token',
    GITLAB_PROJECT_PATH: 'group/project',
  })) {
    vi.stubEnv(key, value)
  }
})

const json = (body: unknown): Request =>
  new Request('http://localhost/api/gantt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const text = (body: string): Request =>
  new Request('http://localhost/api/gantt', { method: 'PUT', body })

type ErrorBody = {
  error: string
  message: string
  issues: { path: string; expected: string; received: string }[]
}

async function errorBodyOf(response: Response): Promise<ErrorBody> {
  expect(response.headers.get('Content-Type')).toBe('application/json')
  return (await response.json()) as ErrorBody
}

const NODE = {
  id: 'api',
  title: 'The API',
}

// A chart with one mirrored node, one local node, and an arrow between them.
const seeded = aChart({
  nodes: [
    aNode('prd'),
    aNode('api', { parentId: 'prd' }),
    aNode('geo-120', { source: { kind: 'jira', key: 'GEO-120' }, title: 'Mirrored' }),
  ],
  edges: [anEdge('api-blocks-geo', 'api', 'geo-120')],
})

function withSeed(extra?: Record<string, string>) {
  return fakeGanttStore({ ...seedChart(seeded), ...extra })
}

describe('GET /api/gantt/charts', () => {
  it('is a 200 carrying the summaries', async () => {
    const { writes } = withSeed()
    const response = await ganttChartsHandlers(writes).GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      charts: [
        {
          id: 'plan',
          title: 'The plan',
          jiraSources: [],
          lastSyncedAt: null,
          nodeCount: 3,
          doneCount: 0,
        },
      ],
    })
  })
})

describe('POST /api/gantt/charts', () => {
  it('is a 201 carrying the created chart', async () => {
    const { writes } = fakeGanttStore()
    const response = await ganttChartsHandlers(writes).POST({
      request: json({ id: 'plan', title: 'The plan' }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id: 'plan', version: 1, nodes: [], edges: [] })
  })

  it('is a 409 for a chart id that is already taken', async () => {
    const { writes } = withSeed()
    const response = await ganttChartsHandlers(writes).POST({
      request: json({ id: 'plan', title: 'Again' }),
    })
    expect(response.status).toBe(409)
    expect((await errorBodyOf(response)).error).toBe('DuplicateChartId')
  })

  it('is a 400 carrying issues[] for an id that is not a slug', async () => {
    const { writes } = fakeGanttStore()
    const response = await ganttChartsHandlers(writes).POST({
      request: json({ id: 'Not A Slug', title: 'The plan' }),
    })
    expect(response.status).toBe(400)
    const body = await errorBodyOf(response)
    expect(body.issues.map((issue) => issue.path)).toEqual(['id'])
    expect(body.issues[0]?.received).toBe('"Not A Slug"')
  })

  it('is a 400 when the body is not JSON at all', async () => {
    const { writes } = fakeGanttStore()
    const response = await ganttChartsHandlers(writes).POST({
      request: new Request('http://localhost/api/gantt', { method: 'POST', body: 'not json' }),
    })
    expect(response.status).toBe(400)
    expect((await errorBodyOf(response)).message).toContain('not valid JSON')
  })
})

describe('/api/gantt/charts/:chartId', () => {
  it('GET is a 200 with hasBody derived per node', async () => {
    const { writes } = withSeed({ [bodyFilePath(FAKE_HOME, 'plan', 'api')]: '# the API' })
    const response = await ganttChartHandlers(writes).GET({ params: { chartId: 'plan' } })
    expect(response.status).toBe(200)
    const chart = (await response.json()) as { nodes: { id: string; hasBody: boolean }[] }
    expect(chart.nodes.map((node) => [node.id, node.hasBody])).toEqual([
      ['prd', false],
      ['api', true],
      ['geo-120', false],
    ])
  })

  it('GET is a 404 for a chart that is not there', async () => {
    const { writes } = withSeed()
    const response = await ganttChartHandlers(writes).GET({ params: { chartId: 'ghost' } })
    expect(response.status).toBe(404)
    expect((await errorBodyOf(response)).error).toBe('ChartNotFound')
  })

  it('GET is a 400 for a chart id outside the slug charset', async () => {
    const { writes } = withSeed()
    const response = await ganttChartHandlers(writes).GET({ params: { chartId: '../escape' } })
    expect(response.status).toBe(400)
    const body = await errorBodyOf(response)
    expect(body.issues[0]?.path).toBe('chartId')
    expect(body.issues[0]?.received).toBe('"../escape"')
  })

  it('PATCH is a 200 with the new title', async () => {
    const { writes } = withSeed()
    const response = await ganttChartHandlers(writes).PATCH({
      params: { chartId: 'plan' },
      request: json({ title: 'Renamed' }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ title: 'Renamed' })
  })

  // Archiving is a confirmed UI action, not an API verb (ADR-0012 §8). The
  // refusal is explicit rather than absent because an unhandled DELETE falls
  // through to the SSR document and answers `200` with an HTML shell, which an
  // agent can read as a deletion that never happened.
  it('refuses DELETE with a 405 that names the reason', async () => {
    const { writes } = withSeed()
    const response = await ganttChartHandlers(writes).DELETE()
    expect(response.status).toBe(405)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('MethodNotAllowed')
    expect(body.message).toContain('Archiving')
  })

  // The assertion that actually matters, and the one an absent key could not
  // make: a DELETE does not delete.
  it('leaves the chart readable after a refused DELETE', async () => {
    const { writes } = withSeed()
    await ganttChartHandlers(writes).DELETE()
    const after = await ganttChartHandlers(writes).GET({ params: { chartId: 'plan' } })
    expect(after.status).toBe(200)
  })
})

describe('POST /api/gantt/charts/:chartId/nodes', () => {
  const post = (writes: GanttWrites, body: unknown) =>
    ganttNodesHandlers(writes).POST({ params: { chartId: 'plan' }, request: json(body) })

  it('is a 201 carrying the created node', async () => {
    const { writes } = withSeed()
    const response = await post(writes, { ...NODE, id: 'ui' })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id: 'ui', parentId: null, orphaned: false })
  })

  it('is a 409 for a duplicate node id', async () => {
    const { writes } = withSeed()
    const response = await post(writes, NODE)
    expect(response.status).toBe(409)
    expect((await errorBodyOf(response)).error).toBe('DuplicateNodeId')
  })

  it('is a 404 for an unknown parentId', async () => {
    const { writes } = withSeed()
    const response = await post(writes, { ...NODE, id: 'ui', parentId: 'ghost' })
    expect(response.status).toBe(404)
    expect((await errorBodyOf(response)).error).toBe('NodeNotFound')
  })

  // The assertion `{ reportInput: true }` exists for: without it every `received`
  // reads `unknown`, and an agent cannot see what it sent.
  it('is a 400 naming start with its expected and its received', async () => {
    const { writes } = withSeed()
    const response = await post(writes, { ...NODE, id: 'ui', start: 'next week' })
    expect(response.status).toBe(400)
    const body = await errorBodyOf(response)
    const issue = body.issues.find((candidate) => candidate.path === 'start')
    expect(issue?.received).toBe('"next week"')
    expect(issue?.expected).toContain('string matching')
  })
})

describe('/api/gantt/charts/:chartId/nodes/:nodeId', () => {
  const patch = (writes: GanttWrites, nodeId: string, body: unknown) =>
    ganttNodeHandlers(writes).PATCH({ params: { chartId: 'plan', nodeId }, request: json(body) })

  it('PATCH is a 422 for a mirrored field on a jira-sourced node', async () => {
    const { writes } = withSeed()
    const response = await patch(writes, 'geo-120', { title: 'Mine now' })
    expect(response.status).toBe(422)
    const body = await errorBodyOf(response)
    expect(body.error).toBe('MirroredFieldPatch')
    expect(body.issues.map((issue) => issue.path)).toEqual(['title'])
  })

  it('PATCH is a 200 for a chart-owned field on that same node', async () => {
    const { writes } = withSeed()
    const response = await patch(writes, 'geo-120', { start: '2026-11-02' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ start: '2026-11-02', title: 'Mirrored' })
  })

  it('PATCH is a 404 for a node that is not there', async () => {
    const { writes } = withSeed()
    const response = await patch(writes, 'ghost', { order: 3 })
    expect(response.status).toBe(404)
  })

  it('DELETE reparents the children, removes the edges, and erases the body and its .prev', async () => {
    const body = bodyFilePath(FAKE_HOME, 'plan', 'api')
    const prev = bodyPrevFilePath(FAKE_HOME, 'plan', 'api')
    const { writes, files } = withSeed({ [body]: '# now', [prev]: '# before' })
    const grandchild = await ganttNodesHandlers(writes).POST({
      params: { chartId: 'plan' },
      request: json({ id: 'ui', title: 'UI', parentId: 'api' }),
    })
    expect(grandchild.status).toBe(201)

    const response = await ganttNodeHandlers(writes).DELETE({
      params: { chartId: 'plan', nodeId: 'api' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      chartId: 'plan',
      nodeId: 'api',
      reparentedTo: 'prd',
      reparentedChildIds: ['ui'],
      removedEdgeIds: ['api-blocks-geo'],
    })
    expect(files.has(body)).toBe(false)
    expect(files.has(prev)).toBe(false)
  })
})

describe('/api/gantt/charts/:chartId/nodes/:nodeId/body', () => {
  const params = { chartId: 'plan', nodeId: 'api' }

  it('PUT writes the markdown and snapshots the predecessor', async () => {
    const { writes, files } = withSeed()
    const handlers = ganttNodeBodyHandlers(writes)

    const first = await handlers.PUT({ params, request: text('# first') })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ chartId: 'plan', nodeId: 'api', snapshotted: false })

    const second = await handlers.PUT({ params, request: text('# second') })
    expect(await second.json()).toMatchObject({ snapshotted: true })
    expect(files.get(bodyFilePath(FAKE_HOME, 'plan', 'api'))).toBe('# second')
    expect(files.get(bodyPrevFilePath(FAKE_HOME, 'plan', 'api'))).toBe('# first')
  })

  it('GET answers the markdown as markdown', async () => {
    const { writes } = withSeed({ [bodyFilePath(FAKE_HOME, 'plan', 'api')]: '# the API' })
    const response = await ganttNodeBodyHandlers(writes).GET({ params })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(await response.text()).toBe('# the API')
  })

  it('GET is a 404 for a node the chart does not have', async () => {
    const { writes } = withSeed()
    const response = await ganttNodeBodyHandlers(writes).GET({
      params: { chartId: 'plan', nodeId: 'ghost' },
    })
    expect(response.status).toBe(404)
    expect((await errorBodyOf(response)).error).toBe('NodeNotFound')
  })
})

describe('/api/gantt/charts/:chartId/edges', () => {
  const post = (writes: GanttWrites, body: unknown) =>
    ganttEdgesHandlers(writes).POST({ params: { chartId: 'plan' }, request: json(body) })

  // ADR-0012 §6: the API never refuses to record a declared dependency. A plan
  // that is impossible should look impossible, not be impossible to write down.
  it('POST is a 201 even when the edge closes a cycle', async () => {
    const { writes } = withSeed()
    const response = await post(writes, { id: 'geo-blocks-api', from: 'geo-120', to: 'api' })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ from: 'geo-120', to: 'api' })
  })

  it('POST is a 404 when an endpoint names a node that does not exist', async () => {
    const { writes } = withSeed()
    const response = await post(writes, { id: 'ghostly', from: 'api', to: 'ghost' })
    expect(response.status).toBe(404)
    expect((await errorBodyOf(response)).error).toBe('NodeNotFound')
  })

  it('POST is a 409 for a duplicate edge id', async () => {
    const { writes } = withSeed()
    const response = await post(writes, { id: 'api-blocks-geo', from: 'geo-120', to: 'api' })
    expect(response.status).toBe(409)
    const body = await errorBodyOf(response)
    expect(body.error).toBe('DuplicateEdgeId')
    expect(body.message).toContain('already has an edge "api-blocks-geo"')
    expect(body.message).not.toContain('endpoint pair')
  })

  // One tag, two refusals, and the message is what separates them: an agent that
  // cannot tell "already declared" from "name collision" either stops when it
  // should rename, or renames and retries when it should stop — and retrying is
  // how the dependency graph silently doubled.
  it('POST is a 409 naming the incumbent edge for a pair already declared', async () => {
    const { writes } = withSeed()
    const response = await post(writes, { id: 'a-fresh-id', from: 'api', to: 'geo-120' })
    expect(response.status).toBe(409)
    const body = await errorBodyOf(response)
    expect(body.error).toBe('DuplicateEdgeId')
    expect(body.message).toContain('"api-blocks-geo"')
    expect(body.message).toContain('endpoint pair')
    expect(body.message).not.toContain('"a-fresh-id"')
  })

  it('POST is a 201 for the reversed pair — that is a cycle, and a cycle is recorded', async () => {
    const { writes } = withSeed()
    const response = await post(writes, { id: 'geo-blocks-api-2', from: 'geo-120', to: 'api' })
    expect(response.status).toBe(201)
  })

  it('DELETE is a 200 carrying the withdrawn edge, and a 404 for an unknown one', async () => {
    const { writes } = withSeed()
    const handlers = ganttEdgeHandlers(writes)
    const removed = await handlers.DELETE({ params: { chartId: 'plan', edgeId: 'api-blocks-geo' } })
    expect(removed.status).toBe(200)
    expect(await removed.json()).toMatchObject({ id: 'api-blocks-geo' })

    const missing = await handlers.DELETE({ params: { chartId: 'plan', edgeId: 'api-blocks-geo' } })
    expect(missing.status).toBe(404)
    expect((await errorBodyOf(missing)).error).toBe('EdgeNotFound')
  })
})

// The SKILL promises that a chart read carries `hasBody` per node. `GET` derived
// it; `POST /charts` and `POST /charts/:chartId/dates` answered with the raw
// `GanttChart` their application service returns, where the key was not `false`
// but **missing** — so an agent treating either response as a chart read saw
// `undefined`. All three now go through `withBodyFlags`, the one derivation.
describe('every route that answers with a whole chart carries hasBody', () => {
  // The jira lane is already dated, so `seedDatesFromHistory` has nothing to ask
  // Jira for and the dates route's happy path is reachable without a gateway.
  const predated = aChart({
    nodes: [
      aNode('prd'),
      aNode('api', { parentId: 'prd' }),
      aNode('geo-120', {
        source: { kind: 'jira', key: 'GEO-120' },
        start: '2026-10-01',
        end: '2026-10-09',
      }),
    ],
  })

  type NodeShape = { id: string; hasBody: boolean }
  type ChartShape = { nodes: NodeShape[] }

  /** The key **exists** and is `false` — not merely that it is falsy. */
  function expectPresentAndFalse(chart: ChartShape, withBody: readonly string[]): void {
    expect(chart.nodes.length).toBeGreaterThan(0)
    for (const node of chart.nodes) {
      expect(Object.hasOwn(node, 'hasBody')).toBe(true)
      expect(node.hasBody).toBe(withBody.includes(node.id))
    }
  }

  // Five routes answer with a whole chart, and the first version of this suite
  // pinned three of them — which is how `PATCH` and `sync` kept returning a chart
  // whose `hasBody` key was **missing** for a slice after the hole was "closed".
  // Enumerated rather than spot-checked, so a sixth such route cannot be added
  // without either going through `withBodyFlags` or failing here.
  it('agrees across every route that answers with a whole chart', async () => {
    const disk = {
      ...seedChart(predated),
      [bodyFilePath(FAKE_HOME, 'plan', 'api')]: '# the API',
    }
    const chartOf = async (response: Response) => (await response.json()) as ChartShape
    const responses = {
      get: await chartOf(
        await ganttChartHandlers(fakeGanttStore(disk).writes).GET({
          params: { chartId: 'plan' },
        }),
      ),
      dates: await chartOf(
        await ganttDatesHandlers(fakeGanttStore(disk).writes).POST({
          params: { chartId: 'plan' },
        }),
      ),
      patch: await chartOf(
        await ganttChartHandlers(fakeGanttStore(disk).writes).PATCH({
          params: { chartId: 'plan' },
          request: json({ title: 'Renamed' }),
        }),
      ),
      sync: await chartOf(
        await ganttSyncHandlers(fakeGanttStore(disk).writes).POST({
          params: { chartId: 'plan' },
        }),
      ),
    }
    for (const [name, chart] of Object.entries(responses)) {
      expect(chart.nodes.length, `${name} returned no nodes`).toBeGreaterThan(0)
      expectPresentAndFalse(chart, ['api'])
    }
  })

  it('agrees between GET /charts/:chartId and POST /charts/:chartId/dates', async () => {
    const { writes } = fakeGanttStore({
      ...seedChart(predated),
      [bodyFilePath(FAKE_HOME, 'plan', 'api')]: '# the API',
    })
    const read = (await (
      await ganttChartHandlers(writes).GET({ params: { chartId: 'plan' } })
    ).json()) as ChartShape
    const dated = (await (
      await ganttDatesHandlers(writes).POST({ params: { chartId: 'plan' } })
    ).json()) as ChartShape

    expectPresentAndFalse(read, ['api'])
    expectPresentAndFalse(dated, ['api'])
    // Not just both present — the same answer for the same chart.
    expect(dated.nodes).toEqual(read.nodes)
  })

  // `POST /charts` can only be driven without a Jira when it names no epics, and
  // such a chart is created empty — so what is assertable here is that the
  // response is the same *shape* as a read, down to its keys. The per-node half
  // of this route's promise is `tests/e2e/gantt/api-contract.spec.ts`, which
  // bootstraps from a mocked epic and gets real lanes back.
  it('answers POST /charts with the same keys a chart read has', async () => {
    const { writes } = fakeGanttStore()
    const created = (await (
      await ganttChartsHandlers(writes).POST({ request: json({ id: 'plan', title: 'The plan' }) })
    ).json()) as Record<string, unknown>
    const read = (await (
      await ganttChartHandlers(writes).GET({ params: { chartId: 'plan' } })
    ).json()) as Record<string, unknown>
    expect(Object.keys(created).toSorted()).toEqual(Object.keys(read).toSorted())
    expect(created).toEqual(read)
  })
})

describe('POST /api/gantt/charts/:chartId/sync', () => {
  // The happy path needs a Jira, and these handlers run on the real
  // `appRuntime`, so it belongs in `sync-chart.test.ts` against a faked gateway.
  // What is route-shaped is the two refusals that happen before Jira is asked —
  // and the status the third one maps to.
  it('is a 404 for a chart that is not there, without reaching Jira', async () => {
    const { writes } = withSeed()
    const response = await ganttSyncHandlers(writes).POST({ params: { chartId: 'ghost' } })
    expect(response.status).toBe(404)
    expect((await errorBodyOf(response)).error).toBe('ChartNotFound')
  })

  it('is a 400 for a chart id outside the slug charset', async () => {
    const { writes } = withSeed()
    const response = await ganttSyncHandlers(writes).POST({ params: { chartId: '../escape' } })
    expect(response.status).toBe(400)
  })

  it('maps JiraUnreachable to a 503 that says the chart was left alone', async () => {
    const response = ganttFailureResponse(
      new JiraUnreachable({ chartId: 'plan', message: 'Jira did not answer' }),
    )
    expect(response.status).toBe(503)
    const body = await errorBodyOf(response)
    expect(body.error).toBe('JiraUnreachable')
    expect(body.message).toContain('left exactly as it was')
  })

  it('has only POST — a sync is a verb, never a side effect of a read', () => {
    const { writes } = withSeed()
    const handlers: Record<string, unknown> = ganttSyncHandlers(writes)
    expect(Object.keys(handlers)).toEqual(['POST'])
  })
})

describe('POST /api/gantt/charts/:chartId/dates', () => {
  // Like sync, the Jira-answering path belongs in `seed-dates.test.ts` against a
  // faked gateway — these handlers run on the real `appRuntime`. What is
  // route-shaped is the refusals, the status the third one maps to, and the one
  // success that needs no Jira at all: a chart with nothing mirrored on it.
  it('is a 200 for a chart with no mirrored lanes, which asks Jira nothing', async () => {
    const localOnly = aChart({ id: 'local-only', nodes: [aNode('prd', { title: 'A PRD' })] })
    const { writes } = fakeGanttStore(seedChart(localOnly))
    const response = await ganttDatesHandlers(writes).POST({ params: { chartId: 'local-only' } })
    expect(response.status).toBe(200)
    expect((await response.json()) as { nodes: unknown[] }).toMatchObject({
      id: 'local-only',
      nodes: [{ id: 'prd', start: null, end: null }],
    })
  })

  it('is a 404 for a chart that is not there, without reaching Jira', async () => {
    const { writes } = withSeed()
    const response = await ganttDatesHandlers(writes).POST({ params: { chartId: 'ghost' } })
    expect(response.status).toBe(404)
    expect((await errorBodyOf(response)).error).toBe('ChartNotFound')
  })

  it('is a 400 for a chart id outside the slug charset', async () => {
    const { writes } = withSeed()
    const response = await ganttDatesHandlers(writes).POST({ params: { chartId: '../escape' } })
    expect(response.status).toBe(400)
  })

  it('maps JiraUnreachable to a 503 that says the chart was left alone', async () => {
    const response = ganttFailureResponse(
      new JiraUnreachable({ chartId: 'plan', message: 'Jira answered for none of the 3 tickets' }),
    )
    expect(response.status).toBe(503)
    const body = await errorBodyOf(response)
    expect(body.error).toBe('JiraUnreachable')
    expect(body.message).toContain('left exactly as it was')
  })

  it('has only POST — seeding dates is a verb, never a side effect of a read', () => {
    const { writes } = withSeed()
    const handlers: Record<string, unknown> = ganttDatesHandlers(writes)
    expect(Object.keys(handlers)).toEqual(['POST'])
  })
})

describe('a defect', () => {
  it('is a logged 500 with a JSON body, not a leaked stack', async () => {
    const seed = withSeed()
    const writes = createGanttWrites({
      ...seed.deps,
      writeFile: () => Promise.reject(new Error('disk full')),
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await ganttNodesHandlers(writes).POST({
      params: { chartId: 'plan' },
      request: json({ ...NODE, id: 'ui' }),
    })

    expect(response.status).toBe(500)
    expect((await errorBodyOf(response)).error).toBe('InternalError')
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('every failure path', () => {
  // ADR-0006 mandates plain-text bodies for its own consumer; this consumer has
  // to self-correct from the error, so the body shape follows the consumer
  // (ADR-0012 §9). One assertion over every status this surface can produce.
  it('answers JSON, never plain text', async () => {
    const { writes } = withSeed()
    const responses = await Promise.all([
      ganttChartsHandlers(writes).POST({ request: json({ id: 'Bad Id', title: 'x' }) }),
      ganttChartHandlers(writes).GET({ params: { chartId: 'ghost' } }),
      ganttChartsHandlers(writes).POST({ request: json({ id: 'plan', title: 'x' }) }),
      ganttNodeHandlers(writes).PATCH({
        params: { chartId: 'plan', nodeId: 'geo-120' },
        request: json({ status: 'In Progress' }),
      }),
    ])

    expect(responses.map((response) => response.status)).toEqual([400, 404, 409, 422])
    for (const response of responses) {
      expect(response.headers.get('Content-Type')).toBe('application/json')
      // oxlint-disable-next-line no-await-in-loop -- four small bodies
      expect(Object.keys((await response.json()) as object).toSorted()).toEqual([
        'error',
        'issues',
        'message',
      ])
    }
  })
})
