import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  GANTT_SKILL_FALLBACK_BASE_URL,
  GANTT_SKILL_FALLBACK_CHART_ID,
  GANTT_SKILL_PATH,
  renderGanttSkill,
} from './gantt-skill'
import {
  createChartBody,
  createEdgeBody,
  createNodeBody,
  ganttChartSchema,
  patchChartBody,
  patchNodeBody,
} from './gantt-schema'

// The SKILL and `gantt-schema.ts` are two halves of one contract, and only one
// half is type-checked. The schema says what a request body may be; the **skill
// is the only place the agent learns a field's name**, so a field the skill never
// names is a field the agent has to guess — and it guesses wrong.
//
// `explain-skill.test.ts` records what that costs, in detail and from life:
// rewriting that skill dropped its one worked example of a `diagram` cell,
// leaving `mermaid` written down nowhere, and the next run was rejected at the
// boundary after twenty minutes with `moves.1.blocks.1.mermaid: expected string,
// received undefined`.
//
// These two tests are that one, plus the half it does not have:
//
//  1. **Every field of every schema is named in the skill text**, introspected
//     from the Zod shapes rather than listed here, so a field added to the
//     contract is covered the day it is added.
//  2. **Every `curl` body in the skill validates against the real request
//     schema** for the verb it demonstrates. This is the half that would have
//     caught the bug the comment above describes, because a worked example that
//     has gone stale fails here rather than in a real run.
//
// Both read the file rather than the rendered output: the placeholders live in
// URLs, never in a body, so a `curl` example is as valid before substitution as
// after it.

const skill = readFileSync(GANTT_SKILL_PATH, 'utf8')

// ---------------------------------------------------------------------------
// 1 — every field of every schema is named
// ---------------------------------------------------------------------------

/**
 * Every schema in `gantt-schema.ts` an agent has to fill or read: the stored
 * chart it gets back, and the five request bodies it sends. Listed by name here
 * only so a failure says which one; the fields come from the shapes.
 */
const SCHEMAS = {
  ganttChartSchema,
  createChartBody,
  patchChartBody,
  createNodeBody,
  patchNodeBody,
  createEdgeBody,
} as const

/** Peel `.default()` / `.optional()` / `.nullable()` off to reach the real type. */
function unwrap(schema: unknown): unknown {
  const def = (schema as { def?: { type?: string; innerType?: unknown } }).def
  if (def === undefined) return schema
  if (def.type === 'default' || def.type === 'optional' || def.type === 'nullable') {
    return unwrap(def.innerType)
  }
  return schema
}

/**
 * Field paths an agent must know, walked one level into arrays and into the
 * discriminated unions `source` is — `source.kind`, `source.key` and
 * `source.linkId` are as easy to get wrong as any top-level field and were the
 * ones the Explain failure was about.
 */
function fieldPathsOf(schema: unknown, prefix = ''): readonly string[] {
  const unwrapped = unwrap(schema) as {
    shape?: Record<string, unknown>
    def?: { type?: string; element?: unknown; options?: readonly unknown[] }
  }
  if (unwrapped.def?.type === 'array') return fieldPathsOf(unwrapped.def.element, prefix)
  if (unwrapped.def?.type === 'union') {
    return (unwrapped.def.options ?? []).flatMap((option) => fieldPathsOf(option, prefix))
  }
  if (unwrapped.shape === undefined) return []
  const paths: string[] = []
  for (const [key, value] of Object.entries(unwrapped.shape)) {
    paths.push(`${prefix}${key}`, ...fieldPathsOf(value, `${prefix}${key}.`))
  }
  return paths
}

/**
 * A field counts as named when the skill writes it as code (`` `start` ``) or as
 * a JSON key (`"start":`). The bare word is not enough: `id`, `order`, `from`,
 * `to` and `key` are ordinary English and would match any prose, which would
 * make this test pass while teaching the agent nothing.
 */
function names(field: string): boolean {
  const leaf = field.split('.').at(-1) as string
  return skill.includes(`\`${leaf}\``) || skill.includes(`"${leaf}":`)
}

describe('the gantt skill names every field of every schema', () => {
  it('covers every schema in gantt-schema.ts', () => {
    // Six today. The count is asserted so that adding a request body without
    // telling the agent about it fails here rather than in a real run.
    expect(Object.keys(SCHEMAS)).toHaveLength(6)
  })

  it.each(Object.entries(SCHEMAS))('names every field of %s', (name, schema) => {
    const fields = fieldPathsOf(schema)
    expect(fields.length).toBeGreaterThan(0)
    const missing = fields.filter((field) => !names(field))
    expect(missing, `the skill never names ${missing.join(', ')} for ${name}`).toEqual([])
  })

  it('names the fields an agent must not send, so it knows they are not optional', () => {
    // `orphaned` is in the stored chart and in none of the request bodies, and an
    // agent that does not know it exists reads `orphaned: true` as noise rather
    // than as "sync says this ticket left the epic".
    const stored = fieldPathsOf(ganttChartSchema)
    expect(stored).toContain('nodes.orphaned')
    expect(skill).toContain('`orphaned`')
  })

  it('names the four mirrored fields together, since the 422 is about the set', () => {
    for (const field of ['title', 'column', 'status', 'assignee']) {
      expect(skill).toContain(`\`${field}\``)
    }
    expect(skill).toContain('422')
  })
})

// ---------------------------------------------------------------------------
// 2 — every curl body validates against the real schema
// ---------------------------------------------------------------------------

/** One `curl` invocation lifted out of a fenced block in the skill. */
type CurlExample = {
  readonly method: string
  readonly route: string
  readonly body: string | null
  /** `true` when the example sends a file or raw text rather than `-d '…'`. */
  readonly raw: boolean
}

/** Fenced ```bash blocks only — the JSON blocks are illustrations, not calls. */
function bashBlocks(text: string): readonly string[] {
  return [...text.matchAll(/```bash\n([\s\S]*?)```/gu)].map((match) => match[1] as string)
}

/**
 * One block may hold several calls. A call may be wrapped with trailing
 * backslashes, and its `-d` payload may itself be pretty-printed over several
 * lines — so the split is at the next line that *starts* a `curl`, not at every
 * newline.
 */
function curlInvocations(block: string): readonly string[] {
  return block
    .replaceAll(/\\\n\s*/gu, ' ')
    .split(/\n(?=curl\b)/u)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('curl'))
}

/** Every path `routes/api/gantt.*.ts` actually serves, and nothing else. */
const KNOWN_ROUTES = new Set([
  '/api/gantt/skill',
  '/api/gantt/charts',
  '/api/gantt/charts/:chartId',
  '/api/gantt/charts/:chartId/sync',
  '/api/gantt/charts/:chartId/dates',
  '/api/gantt/charts/:chartId/nodes',
  '/api/gantt/charts/:chartId/nodes/:nodeId',
  '/api/gantt/charts/:chartId/nodes/:nodeId/body',
  '/api/gantt/charts/:chartId/edges',
  '/api/gantt/charts/:chartId/edges/:edgeId',
])

/**
 * The concrete URL in an example → the route it exercises, with the ids the
 * example chose put back as their parameter names. `null` for a path this
 * surface does not serve, which is a failure the caller reports rather than
 * swallows: an example pointing at a route that was never written is exactly
 * the stale-documentation bug these tests exist for.
 */
function routeOf(url: string): string | null {
  const path = url.replace('{{BASE_URL}}', '').split('?')[0] ?? ''
  const rest = path
    .replace(/^\/api\/gantt\/?/u, '')
    .split('/')
    .filter(Boolean)
  const shape = rest.map((segment, index) => {
    if (index === 1) return ':chartId'
    if (index === 3) return rest[2] === 'edges' ? ':edgeId' : ':nodeId'
    return segment
  })
  const route = `/api/gantt/${shape.join('/')}`
  return KNOWN_ROUTES.has(route) ? route : null
}

function parseCurl(invocation: string): CurlExample | null {
  const url = invocation.match(/https?:\/\/\S+|\{\{BASE_URL\}\}\S+/u)?.[0]
  if (url === undefined) return null
  const route = routeOf(url.replaceAll(/["']/gu, ''))
  if (route === null) return null
  const body = invocation.match(/(?:^|\s)-d\s+'([^']*)'/u)?.[1] ?? null
  return {
    method: invocation.match(/-X\s+([A-Z]+)/u)?.[1] ?? 'GET',
    route,
    body,
    raw: /--data-binary/u.test(invocation),
  }
}

/**
 * The request schema each writing verb decodes its body with — the real ones, so
 * an example that drifts from the contract fails here. `.strict()` is the point:
 * every field of a patch body is optional, so without it a misspelled key would
 * validate as an empty patch and this test would pass on a body the server would
 * silently ignore.
 */
const BODY_SCHEMAS: Record<string, z.ZodType> = {
  'POST /api/gantt/charts': createChartBody.strict(),
  'PATCH /api/gantt/charts/:chartId': patchChartBody.strict(),
  'POST /api/gantt/charts/:chartId/nodes': createNodeBody.strict(),
  'PATCH /api/gantt/charts/:chartId/nodes/:nodeId': patchNodeBody.strict(),
  'POST /api/gantt/charts/:chartId/edges': createEdgeBody.strict(),
}

/** Every verb the surface has. A verb with no worked example is a verb an agent will improvise. */
const EVERY_VERB = [
  'GET /api/gantt/skill',
  'GET /api/gantt/charts',
  'POST /api/gantt/charts',
  'GET /api/gantt/charts/:chartId',
  'PATCH /api/gantt/charts/:chartId',
  'POST /api/gantt/charts/:chartId/sync',
  'POST /api/gantt/charts/:chartId/dates',
  'POST /api/gantt/charts/:chartId/nodes',
  'PATCH /api/gantt/charts/:chartId/nodes/:nodeId',
  'DELETE /api/gantt/charts/:chartId/nodes/:nodeId',
  'GET /api/gantt/charts/:chartId/nodes/:nodeId/body',
  'PUT /api/gantt/charts/:chartId/nodes/:nodeId/body',
  'POST /api/gantt/charts/:chartId/edges',
  'DELETE /api/gantt/charts/:chartId/edges/:edgeId',
] as const

const EXAMPLES: readonly CurlExample[] = bashBlocks(skill)
  .flatMap(curlInvocations)
  .map(parseCurl)
  .filter((example): example is CurlExample => example !== null)

describe('every curl example in the gantt skill', () => {
  it('is extracted at all, so a parsing change cannot silently empty this suite', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(EVERY_VERB.length)
  })

  it.each(EVERY_VERB)('includes a worked example of %s', (verb) => {
    const [method, route] = verb.split(' ')
    expect(
      EXAMPLES.some((example) => example.method === method && example.route === route),
      `the skill has no ${verb} example, so an agent will have to guess that call`,
    ).toBe(true)
  })

  it('sends a body exactly where the surface takes one', () => {
    for (const example of EXAMPLES) {
      const verb = `${example.method} ${example.route}`
      const takesJson = verb in BODY_SCHEMAS
      expect(example.body !== null, `${verb} ${takesJson ? 'needs' : 'takes no'} a JSON body`).toBe(
        takesJson,
      )
    }
  })

  it('validates against the real request schema', () => {
    const withBodies = EXAMPLES.filter((example) => example.body !== null)
    expect(withBodies).toHaveLength(Object.keys(BODY_SCHEMAS).length)
    for (const example of withBodies) {
      const verb = `${example.method} ${example.route}`
      const schema = BODY_SCHEMAS[verb] as z.ZodType
      const result = schema.safeParse(JSON.parse(example.body as string))
      expect(
        result.success,
        `the ${verb} example does not validate: ${JSON.stringify(result.error?.issues)}`,
      ).toBe(true)
    }
  })

  it('sends the node body as raw markdown rather than as a JSON field', () => {
    // Every other verb takes JSON, so this is the one an agent will assume wrong
    // unless the skill both says so and shows it (ADR-0012 §9, slice 93).
    const put = EXAMPLES.find(
      (example) =>
        example.method === 'PUT' &&
        example.route === '/api/gantt/charts/:chartId/nodes/:nodeId/body',
    )
    expect(put?.raw).toBe(true)
    expect(put?.body).toBeNull()
    expect(skill).toContain('raw markdown')
  })
})

// ---------------------------------------------------------------------------
// The things the skill must say, and the substitution it is copied through
// ---------------------------------------------------------------------------

describe('the gantt skill', () => {
  it('opens with the probe and says to stop rather than queue or write files', () => {
    const probe = skill.indexOf('curl -sf {{BASE_URL}}/api/gantt/charts')
    expect(probe).toBeGreaterThan(-1)
    // Nothing but the preamble may come before it: an agent that has already
    // started working has already lost the work.
    expect(skill.slice(0, probe)).not.toContain('curl')
    expect(skill).toContain('**If the connection is refused, stop.**')
    expect(skill).toContain('Do not queue the work.')
    expect(skill).toContain('Do not write `~/.clashboard/gantt/` directly.')
  })

  // The refusal is a written `405` rather than an absent handler, so the skill
  // must name the status an agent will actually get back — "does not exist"
  // would send it looking for another spelling.
  it('says a chart cannot be deleted, and names the 405 it will get if it tries', () => {
    expect(skill).toContain('`DELETE /api/gantt/charts/:chartId` answers `405 MethodNotAllowed`')
    expect(skill).toContain('archiving')
  })

  it('teaches the slug charset, the date format and the body filename', () => {
    expect(skill).toContain('^[a-z0-9][a-z0-9-]{0,63}$')
    expect(skill).toContain('`YYYY-MM-DD`')
    expect(skill).toContain("**A node id is also its body's filename.**")
  })

  // The bug this one pins is the only one in this file that shipped *through*
  // the other tests: an agent followed the skill faithfully and produced 29
  // correctly parented lanes with `start: null, end: null` on every one, because
  // the document taught the date format and never said where a date comes from.
  // Every test above passed throughout — they check that a field is *named*, not
  // that the agent is told how to *fill* one. So the three sentences that fix it
  // are asserted literally: the call, the reason it is safe to make, and the
  // reason it is safe to make twice.
  it('tells the agent to seed the dates from history, and that doing so is safe', () => {
    expect(skill).toContain('POST {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/dates')
    // An agent that fears clobbering its own planning will never make the call,
    // so "it only fills blanks" is as load-bearing as the endpoint itself.
    expect(skill).toContain('**It only fills blanks.**')
    expect(skill).toContain('**It is safe to re-run.**')
    // And it is step one, not advice buried later: its absence is what produced
    // the undated chart, so the working order has to carry it.
    expect(skill).toContain('**Seed the dates from history**')
    // Leaving `end` null has to read as a result rather than as an omission, or
    // the agent invents a date to avoid looking incomplete.
    expect(skill).toContain('**leave `end` null**')
    expect(skill).toContain('open-ended bar')
  })

  it('tells the agent a cycle is accepted and is the plan talking, not a retry', () => {
    expect(skill).toContain('closes a cycle is accepted')
    expect(skill).toContain('fix the plan')
  })

  it('teaches reading an error: the status, the tag, and issues[]', () => {
    expect(skill).toContain('**The status is the category.**')
    expect(skill).toContain('**`issues[]` names the field.**')
    expect(skill).toContain('**A `400` is a correction, not a dead end.**')
    for (const expected of ['`path`', '`expected`', '`received`']) {
      expect(skill).toContain(expected)
    }
  })

  it('substitutes both placeholders, leaving no {{ behind', async () => {
    const rendered = await renderGanttSkill({
      baseUrl: 'http://localhost:9999/',
      chartId: 'demo-pricing-rework',
    })
    expect(rendered).not.toContain('{{')
    // The trailing slash is dropped, or every path in the document doubles it.
    expect(rendered).toContain('http://localhost:9999/api/gantt/charts/demo-pricing-rework')
    expect(rendered).not.toContain('http://localhost:9999//')
    // The frontmatter is harness configuration, not instruction.
    expect(rendered).not.toContain('disable-model-invocation')
  })

  it('falls back to a documented placeholder when the caller cannot say', async () => {
    const rendered = await renderGanttSkill({ baseUrl: null, chartId: null })
    expect(rendered).not.toContain('{{')
    expect(rendered).toContain(GANTT_SKILL_FALLBACK_BASE_URL)
    expect(rendered).toContain(GANTT_SKILL_FALLBACK_CHART_ID)
    // The fallback chart id is itself a valid slug, so a copy that forgets to
    // substitute it fails with a readable 404 rather than a 400 about its shape.
    expect(createChartBody.shape.id.safeParse(GANTT_SKILL_FALLBACK_CHART_ID).success).toBe(true)
  })

  it('declares the frontmatter the harness reads', () => {
    expect(skill).toMatch(/^---\nname: clashboard-gantt\n/u)
    expect(skill).toContain('disable-model-invocation: true')
    expect(skill).toMatch(/\ndescription: .+\n/u)
  })
})
