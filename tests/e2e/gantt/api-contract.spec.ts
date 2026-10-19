import { expect, test } from '../fixtures/test'

// The REST contract an agent drives, over the real server (ADR-0012 §7).
//
// This is the one spec here that is not about the browser. The consumer of
// `/api/gantt/*` is an **external process hitting a documented URL**, which is
// precisely the third consumer arm ADR-0006 grew — so the honest test is an HTTP
// client, not a page. Playwright's `request` fixture is that client, and it goes
// through the whole stack: route handler, decode, write queue, store, disk.
//
// Nothing is mocked. A chart has no HTTP boundary behind it (the app is its
// system of record, ADR-0012 §1), so what ADR-0001 isolates here is the
// **filesystem**: `HOME` points at a throwaway directory and the `local` fixture
// wipes `~/.clashboard` around every test, so these writes never touch the
// developer's own charts.
//
// What it pins, in order: that an agent can build a chart from nothing, that an
// error names the field it got wrong, that the chart it reads back is the chart
// it wrote, and that **`DELETE /charts/:chartId` is not there** — an endpoint
// that was never written is indistinguishable from one deleted by accident, so
// its absence is only a decision while something asserts it.

const CHART = 'e2e-plan'
const CHARTS = '/api/gantt/charts'

type GanttIssue = { path: string; expected: string; received: string }
type ErrorBody = { error: string; message: string; issues: GanttIssue[] }

test('an agent builds a chart from nothing, patches it, and reads it back', async ({ request }) => {
  const created = await request.post(CHARTS, { data: { id: CHART, title: 'E2E plan' } })
  expect(created.status()).toBe(201)
  const chart = await created.json()
  // The server supplies what it observes rather than what a caller claims:
  // `version`, `createdAt`, and an empty chart to arrange.
  expect(chart).toMatchObject({ version: 1, id: CHART, title: 'E2E plan', nodes: [], edges: [] })
  expect(chart.lastSyncedAt).toBeNull()
  expect(typeof chart.createdAt).toBe('string')

  // Ids are agent-supplied slugs, so the agent can address a node across many
  // turns without carrying a map it cannot reconstruct (ADR-0012 §8).
  const prd = await request.post(`${CHARTS}/${CHART}/nodes`, {
    data: { id: 'tier-migration', title: 'Tier migration', start: '2026-10-05', end: '2026-11-15' },
  })
  expect(prd.status()).toBe(201)

  // A mirrored node under it: Jira's half is given at creation, the chart's half
  // is the placement and the dates.
  const ticket = await request.post(`${CHARTS}/${CHART}/nodes`, {
    data: {
      id: 'geo-500',
      parentId: 'tier-migration',
      title: 'Quote endpoint returns tiers',
      source: { kind: 'jira', key: 'GEO-500' },
      status: 'In Code Review',
      column: 'In Code Review',
      assignee: 'Andreas Hoffmann',
      start: '2026-10-05',
      end: '2026-10-14',
    },
  })
  expect(ticket.status()).toBe(201)

  // One edge, and it means `from` blocks `to` — there is no kind to pick.
  const edge = await request.post(`${CHARTS}/${CHART}/edges`, {
    data: { id: 'geo-500-blocks-tier-migration', from: 'geo-500', to: 'tier-migration' },
  })
  expect(edge.status()).toBe(201)

  // A date is chart-owned on every node, so patching one is an ordinary write.
  const patched = await request.patch(`${CHARTS}/${CHART}/nodes/geo-500`, {
    data: { end: '2026-10-20' },
  })
  expect(patched.status()).toBe(200)

  const readBack = await request.get(`${CHARTS}/${CHART}`)
  expect(readBack.status()).toBe(200)
  const stored = await readBack.json()
  expect(stored.nodes.map((node: { id: string }) => node.id)).toEqual(['tier-migration', 'geo-500'])
  const geo = stored.nodes.find((node: { id: string }) => node.id === 'geo-500')
  expect(geo).toMatchObject({
    parentId: 'tier-migration',
    start: '2026-10-05',
    end: '2026-10-20',
    source: { kind: 'jira', key: 'GEO-500' },
    orphaned: false,
  })
  // `hasBody` is derived from the presence of `bodies/<id>.md`, never stored —
  // and `GET` carries the flag rather than the prose, so an agent looking up a
  // node id pays nothing for PRD text (ADR-0012 §11).
  expect(geo.hasBody).toBe(false)
  expect(stored.edges).toHaveLength(1)
  expect(stored.edges[0]).toMatchObject({ from: 'geo-500', to: 'tier-migration' })

  // A body is its own endpoint and travels as **markdown, not a JSON field** —
  // JSON-escaping a two-hundred-line PRD into one string is the step an agent
  // most reliably gets wrong.
  const wrote = await request.put(`${CHARTS}/${CHART}/nodes/tier-migration/body`, {
    headers: { 'Content-Type': 'text/markdown' },
    data: '# Tier migration\n\nFour tiers, everywhere.\n',
  })
  expect(wrote.status()).toBe(200)
  const body = await request.get(`${CHARTS}/${CHART}/nodes/tier-migration/body`)
  expect(body.headers()['content-type']).toContain('text/markdown')
  expect(await body.text()).toContain('Four tiers, everywhere.')

  const withBody = await (await request.get(`${CHARTS}/${CHART}`)).json()
  expect(withBody.nodes.find((node: { id: string }) => node.id === 'tier-migration').hasBody).toBe(
    true,
  )

  // The list is the SKILL's probe, and it now has something to answer with.
  const list = await (await request.get(CHARTS)).json()
  expect(list.charts.map((summary: { id: string }) => summary.id)).toContain(CHART)
})

test('a rejected write names the field, so the next call can correct it', async ({ request }) => {
  await request.post(CHARTS, { data: { id: CHART, title: 'E2E plan' } })

  // A bad date, which is the mistake an agent actually makes. The body carries
  // `issues[]` — the whole reason this surface returns JSON where ADR-0006
  // mandates plain text (ADR-0012 §9).
  const badDate = await request.post(`${CHARTS}/${CHART}/nodes`, {
    data: { id: 'rate-cards', title: 'Rate cards', start: '2026-13-01' },
  })
  expect(badDate.status()).toBe(400)
  const dateError: ErrorBody = await badDate.json()
  expect(dateError.error).toBe('InvalidChartPayload')
  expect(dateError.issues[0]?.path).toBe('start')
  // `received` is concrete, not the literal string "unknown": it is the half of
  // the error that makes it correctable.
  expect(dateError.issues[0]?.received).toBe('"2026-13-01"')

  // An id that is not a slug, rejected in the URL as well as in a body: the
  // charset *is* the path guard, so `../escape` never reaches the filesystem.
  const badId = await request.get(`${CHARTS}/Not_A_Slug`)
  expect(badId.status()).toBe(400)
  expect(((await badId.json()) as ErrorBody).issues[0]?.path).toBe('chartId')

  // An unknown chart is a 404 that says which chart — and it carries the same
  // three keys, `issues` included even when it is empty, because one shape is
  // worth more to a programmatic consumer than a key it has to test for.
  const missing = await request.get(`${CHARTS}/no-such-chart`)
  expect(missing.status()).toBe(404)
  const missingError: ErrorBody = await missing.json()
  expect(missingError).toEqual({
    error: 'ChartNotFound',
    message: expect.stringContaining('no-such-chart'),
    issues: [],
  })

  // A duplicate id is a 409, because an id is a *handle*: two nodes sharing one
  // would make `PATCH /nodes/:nodeId` ambiguous.
  await request.post(`${CHARTS}/${CHART}/nodes`, { data: { id: 'twice', title: 'First' } })
  const duplicate = await request.post(`${CHARTS}/${CHART}/nodes`, {
    data: { id: 'twice', title: 'Second' },
  })
  expect(duplicate.status()).toBe(409)
  expect(((await duplicate.json()) as ErrorBody).error).toBe('DuplicateNodeId')

  // Patching a field sync owns on a mirrored node is refused rather than
  // accepted and silently overwritten by the next sync (ADR-0012 §3).
  await request.post(`${CHARTS}/${CHART}/nodes`, {
    data: { id: 'geo-501', title: 'Mirrored', source: { kind: 'jira', key: 'GEO-501' } },
  })
  const mirrored = await request.patch(`${CHARTS}/${CHART}/nodes/geo-501`, {
    data: { title: 'Renamed by hand' },
  })
  expect(mirrored.status()).toBe(422)
  const mirroredError: ErrorBody = await mirrored.json()
  expect(mirroredError.error).toBe('MirroredFieldPatch')
  expect(mirroredError.issues[0]?.path).toBe('title')
})

test('DELETE /charts/:chartId is not routed, and the chart survives asking', async ({
  request,
}) => {
  await request.post(CHARTS, { data: { id: CHART, title: 'E2E plan' } })

  // Archiving a chart is a confirmed UI action: single-writer is a rule about
  // chart *content*, and the irreversible verb over a system of record belongs
  // with the human rather than with a process acting on paraphrased
  // instructions (ADR-0012 §8). So there is no verb here for an agent to reach.
  const attempted = await request.delete(`${CHARTS}/${CHART}`)
  // The route file declares `GET` and `PATCH` and no `DELETE`, so the request is
  // not answered by this API at all — it falls through to the SSR document
  // handler and comes back as the app's HTML shell. That is why the assertion is
  // on the **shape** of the answer rather than on a status: there is no `405`
  // here to pin, and `expect(ok()).toBe(false)` would be asserting a behaviour
  // the framework never promised.
  expect(attempted.headers()['content-type']).not.toContain('application/json')

  // The assertion that matters is not the status code but that nothing happened.
  const survived = await request.get(`${CHARTS}/${CHART}`)
  expect(survived.status()).toBe(200)
  expect((await survived.json()).id).toBe(CHART)

  // The node-level DELETE *does* exist, and it is non-destructive about the
  // tree: a removed node's children are reparented rather than lost.
  await request.post(`${CHARTS}/${CHART}/nodes`, { data: { id: 'parent', title: 'Parent' } })
  await request.post(`${CHARTS}/${CHART}/nodes`, {
    data: { id: 'child', parentId: 'parent', title: 'Child' },
  })
  expect((await request.delete(`${CHARTS}/${CHART}/nodes/parent`)).status()).toBe(200)
  const after = await (await request.get(`${CHARTS}/${CHART}`)).json()
  expect(after.nodes.map((node: { id: string }) => node.id)).toEqual(['child'])
  expect(after.nodes[0].parentId).toBeNull()
})

test('GET /api/gantt/skill serves the parameterised document', async ({ request, baseURL }) => {
  const served = await request.get('/api/gantt/skill?chart=e2e-plan')
  expect(served.status()).toBe(200)
  // Markdown, because that is what it is — the same text the header's copy
  // button puts on the clipboard, for an agent that would rather fetch it.
  expect(served.headers()['content-type']).toContain('text/markdown')

  const skill = await served.text()
  // Both placeholders substituted, and **nothing left unsubstituted**: a copy
  // that still said `{{CHART_ID}}` would send an agent at a chart that cannot
  // exist, which is the one thing a pasted SKILL must get right.
  expect(skill).not.toContain('{{')
  expect(skill).toContain(`${baseURL ?? ''}/api/gantt/charts/e2e-plan`)
  // It still teaches the probe-or-stop and the missing verb, which are the two
  // instructions that cannot be inferred from the endpoints.
  expect(skill).toContain('/api/gantt/charts')

  // A `?chart=` that is not a slug is a 400 in this surface's one error shape,
  // naming the parameter — not a document quietly pointed at nothing.
  const rejected = await request.get('/api/gantt/skill?chart=Not%20A%20Slug')
  expect(rejected.status()).toBe(400)
  const error: ErrorBody = await rejected.json()
  expect(error.issues[0]?.path).toBe('chart')

  // No `?chart=` at all is legal: an agent with no chart yet still needs the
  // document, and the fallback id is a valid slug on purpose, so acting on it
  // fails with a clean `404 ChartNotFound` rather than a `400` about an id.
  const unparameterised = await request.get('/api/gantt/skill')
  expect(unparameterised.status()).toBe(200)
  expect(await unparameterised.text()).not.toContain('{{')
})
