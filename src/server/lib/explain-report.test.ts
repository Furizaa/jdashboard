import { describe, expect, it } from 'vitest'
import { EXPLAIN_REPORT_VERSION, parseExplainReport, type ExplainBlock } from './explain-report'

// The report is the contract between an untrusted agent and a typed UI, so
// everything here is hostile input. Table-driven over the nine cell types first,
// then over the move envelope that chapters them (ADR-0010), then the ways a
// reply can be wrong.
//
// The cell tests put their cell in `overview`, because the schema deliberately
// does not restrict which cells may appear where: the same union serves both
// lists, and narrowing it was the rejected option in ADR-0010 §5.

const MOVE = {
  id: 'rounding-leaves-pricing',
  title: 'Rounding leaves the pricing service',
  summary: 'A rule the service owned becomes each caller’s responsibility.',
  systems: ['pricing'],
  paths: ['src/pricing/quote.ts'],
  blocks: [{ type: 'narrative', body: '`quoteFor` returns raw cents now.' }],
}

type ReplyOptions = { moves?: readonly unknown[]; version?: unknown }

function reply(overview: readonly unknown[], options: ReplyOptions = {}): string {
  return JSON.stringify({
    version: options.version ?? EXPLAIN_REPORT_VERSION,
    overview,
    moves: options.moves ?? [MOVE],
  })
}

function parse(overview: readonly unknown[], options?: ReplyOptions) {
  return parseExplainReport(reply(overview, options))
}

function expectOk(overview: readonly unknown[]): readonly ExplainBlock[] {
  const result = parse(overview)
  if (!result.ok) throw new Error(`expected ok, got: ${result.error.message}`)
  return result.report.overview
}

const VERDICT = { type: 'verdict', verdict: 'discuss', headline: 'Two systems, one contract' }

const EVERY_BLOCK: ReadonlyArray<readonly [string, unknown]> = [
  ['verdict', VERDICT],
  [
    'systems',
    {
      type: 'systems',
      systems: [{ name: 'pricing', role: 'now owns rounding', change: 'contract-changed' }],
    },
  ],
  ['narrative', { type: 'narrative', title: 'What changed', body: 'Quote building **moved**.' }],
  ['diagram', { type: 'diagram', title: 'New call path', mermaid: 'graph TD;\n A-->B;' }],
  [
    'model',
    {
      type: 'model',
      title: 'The usergroup domain',
      caption: 'Three UI tickets code against these shapes.',
      entities: [
        {
          name: 'Usergroup',
          kind: 'added',
          note: 'the aggregate the UI edits',
          fields: [
            { name: 'id', type: 'UsergroupId' },
            { name: 'members', type: 'readonly Member[]', note: 'ordered' },
          ],
        },
        { name: 'Member', kind: 'added', fields: [{ name: 'accountId', type: 'AccountId' }] },
      ],
      relations: [
        { from: 'Usergroup', to: 'Member', cardinality: 'one-to-many', label: 'contains' },
      ],
    },
  ],
  [
    'diff',
    {
      type: 'diff',
      path: 'src/pricing/quote.ts',
      language: 'typescript',
      caption: 'The rounding call is simply gone.',
      diff: '@@ -41,7 +41,7 @@\n-  return round(total)\n+  return total',
    },
  ],
  [
    'finding',
    {
      type: 'finding',
      system: 'pricing',
      title: 'Rounding moved across a boundary',
      severity: 'high',
      whyItMatters: 'Totals and line items can now disagree by a cent.',
      hunk: { path: 'src/pricing/quote.ts', language: 'typescript', diff: '@@ -1 +1 @@\n-a\n+b' },
    },
  ],
  [
    'blast-radius',
    {
      type: 'blast-radius',
      rows: [
        {
          surface: 'POST /quotes',
          ifWrong: 'Quotes round differently from invoices.',
          downstream: ['billing', 'reporting'],
          likelihood: 'medium',
        },
      ],
    },
  ],
  [
    'questions',
    {
      type: 'questions',
      questions: [{ question: 'Is rounding meant to be the caller’s job now?' }],
    },
  ],
  [
    'unverified',
    {
      type: 'unverified',
      items: [{ claim: 'The suite still passes.', why: 'No install or test run in the worktree.' }],
    },
  ],
]

describe('parseExplainReport — every cell type', () => {
  it.each(EVERY_BLOCK)('accepts a %s cell', (_name, block) => {
    expect(expectOk([block])).toEqual([block])
  })

  it('accepts a whole overview carrying all ten at once', () => {
    const blocks = EVERY_BLOCK.map(([, block]) => block)
    expect(expectOk(blocks)).toHaveLength(10)
  })

  it('accepts the same cells inside a move, since the union is shared', () => {
    const blocks = EVERY_BLOCK.map(([, block]) => block)
    const result = parse([VERDICT], { moves: [{ ...MOVE, blocks }] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.moves[0]?.blocks).toHaveLength(10)
  })

  it('accepts a diff cell with no caption and no language', () => {
    expect(
      expectOk([{ type: 'diff', path: 'src/pricing/quote.ts', diff: '@@ -1 +1 @@\n-a\n+b' }]),
    ).toHaveLength(1)
  })

  it('defaults a blast-radius row with no downstream to an empty list', () => {
    const blocks = expectOk([
      {
        type: 'blast-radius',
        rows: [{ surface: 'GET /quotes', ifWrong: 'Stale totals.', likelihood: 'low' }],
      },
    ])
    expect(blocks[0]).toMatchObject({ rows: [{ downstream: [] }] })
  })
})

describe('parseExplainReport — the model cell', () => {
  const ENTITY = { name: 'Usergroup', kind: 'added' }

  it('defaults a model with no fields and no relations to empty lists', () => {
    // A pre-existing type included so a relation has somewhere to land needs no
    // fields, and one new value object on its own needs no relations.
    const blocks = expectOk([{ type: 'model', entities: [ENTITY] }])
    expect(blocks[0]).toMatchObject({ entities: [{ fields: [] }], relations: [] })
  })

  it('rejects an entity that does not say whether it is new', () => {
    // `kind` is required: "which of these types are new" is the first thing an
    // architect asks, and the picture cannot carry it (ADR-0011 §3).
    const result = parse([{ type: 'model', entities: [{ name: 'Usergroup' }] }])
    expect(result.ok).toBe(false)
  })

  it('rejects a kind it does not define', () => {
    expect(parse([{ type: 'model', entities: [{ name: 'X', kind: 'tweaked' }] }]).ok).toBe(false)
  })

  it('rejects a model with no entities', () => {
    expect(parse([{ type: 'model', entities: [] }]).ok).toBe(false)
  })

  it('rejects a relation to a type the cell never described', () => {
    // It would draw as a box with no fields and no kind, and the reader would
    // have no way to tell that from the model.
    const result = parse([
      {
        type: 'model',
        entities: [ENTITY],
        relations: [
          { from: 'Usergroup', to: 'Ghost', cardinality: 'one-to-many', label: 'contains' },
        ],
      },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain("not one of this model's entities")
  })

  it('names the end that is wrong, not just the relation', () => {
    const result = parse([
      {
        type: 'model',
        entities: [ENTITY],
        relations: [{ from: 'Nobody', to: 'Usergroup', cardinality: 'one-to-one', label: 'owns' }],
      },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('relations.0.from')
  })

  it('rejects two entities claiming one name', () => {
    const result = parse([{ type: 'model', entities: [ENTITY, { ...ENTITY, kind: 'existing' }] }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('duplicate entity')
  })

  it('rejects a cardinality it does not define', () => {
    const result = parse([
      {
        type: 'model',
        entities: [ENTITY],
        relations: [
          { from: 'Usergroup', to: 'Usergroup', cardinality: 'some-to-some', label: 'x' },
        ],
      },
    ])
    expect(result.ok).toBe(false)
  })

  it('keeps a TypeScript type exactly as the agent wrote it', () => {
    // Sanitising for mermaid happens in the view, on the way to a diagram. The
    // report keeps the source's own spelling.
    const blocks = expectOk([
      {
        type: 'model',
        entities: [
          { name: 'X', kind: 'added', fields: [{ name: 'm', type: 'Record<string, Member>' }] },
        ],
      },
    ])
    expect(blocks[0]).toMatchObject({
      entities: [{ fields: [{ type: 'Record<string, Member>' }] }],
    })
  })
})

describe('parseExplainReport — the altitude rules', () => {
  it('rejects a finding with no system', () => {
    const result = parse([
      {
        type: 'finding',
        title: 'Variable name is unclear',
        severity: 'low',
        whyItMatters: 'Readability.',
      },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('overview.0.system')
  })

  it('rejects a finding with no whyItMatters', () => {
    const result = parse([
      { type: 'finding', system: 'pricing', title: 'Odd import', severity: 'low' },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('whyItMatters')
  })

  it('rejects a nit severity — there is no such severity to select', () => {
    const result = parse([
      {
        type: 'finding',
        system: 'pricing',
        title: 'Line too long',
        severity: 'nit',
        whyItMatters: 'Style.',
      },
    ])
    expect(result.ok).toBe(false)
  })

  it('rejects an unverified item that does not say why it is unverified', () => {
    expect(parse([{ type: 'unverified', items: [{ claim: 'Tests pass.' }] }]).ok).toBe(false)
  })
})

describe('parseExplainReport — the move envelope', () => {
  it('accepts several moves and keeps the agent’s order', () => {
    const second = { ...MOVE, id: 'legacy-helper-deleted', title: 'The helper is deleted' }
    const result = parse([VERDICT], { moves: [second, MOVE] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Never re-sorted: the order *is* the reading order (ADR-0010 §5).
    expect(result.report.moves.map((move) => move.id)).toEqual([
      'legacy-helper-deleted',
      'rounding-leaves-pricing',
    ])
  })

  it.each([
    ['summary', { ...MOVE, summary: undefined }],
    ['systems', { ...MOVE, systems: [] }],
    ['paths', { ...MOVE, paths: [] }],
    ['title', { ...MOVE, title: '  ' }],
    ['blocks', { ...MOVE, blocks: [] }],
  ])('rejects a move with no %s — the rail would have nothing to show', (_field, move) => {
    expect(parse([VERDICT], { moves: [move] }).ok).toBe(false)
  })

  it.each([
    ['an index', '1'],
    ['capitals', 'Rounding-Leaves-Pricing'],
    ['spaces', 'rounding leaves pricing'],
    ['a trailing hyphen', 'rounding-'],
    ['a path', 'src/pricing/quote.ts'],
  ])('rejects a move id that is %s — the id goes in a URL', (_name, id) => {
    expect(parse([VERDICT], { moves: [{ ...MOVE, id }] }).ok).toBe(false)
  })

  it('accepts a slug with digits in it', () => {
    const result = parse([VERDICT], { moves: [{ ...MOVE, id: 'adr-0010-follow-up' }] })
    expect(result.ok).toBe(true)
  })

  it('rejects two moves claiming one id', () => {
    const result = parse([VERDICT], { moves: [MOVE, { ...MOVE, title: 'Something else' }] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('duplicate move id')
  })
})

describe('parseExplainReport — malformed replies', () => {
  it('rejects an unknown block type', () => {
    const result = parse([VERDICT, { type: 'vibes', body: 'feels fine' }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('the explain report did not match the contract')
  })

  it('rejects a report version it does not implement', () => {
    expect(parse([VERDICT], { version: 3 }).ok).toBe(false)
    expect(parse([VERDICT], { version: '2' }).ok).toBe(false)
    // No version at all — an older agent, or a hand-rolled reply.
    expect(parseExplainReport(JSON.stringify({ overview: [VERDICT], moves: [MOVE] })).ok).toBe(
      false,
    )
  })

  it('rejects a v1 report outright — there is deliberately no migration shim', () => {
    // ADR-0010 §4: a v1 record on disk reads as absent, which the tab already
    // renders as "interrupted — re-run". This is the behaviour that rests on.
    const v1 = JSON.stringify({ version: 1, blocks: [VERDICT] })
    const result = parseExplainReport(v1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.raw).toBe(v1)
  })

  it('rejects an empty overview — a report with nothing in it is not a report', () => {
    expect(parse([]).ok).toBe(false)
  })

  it('rejects a report with no moves at all', () => {
    expect(parse([VERDICT], { moves: [] }).ok).toBe(false)
  })

  it('rejects a truncated reply without half-parsing it', () => {
    const truncated = reply([VERDICT]).slice(0, 40)
    const result = parseExplainReport(truncated)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('the explain agent did not return a report object')
  })

  it('rejects a reply with no JSON object at all', () => {
    const result = parseExplainReport('I could not review this merge request.')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('the explain agent did not return a report object')
  })

  it('rejects a JSON object that is not JSON', () => {
    const result = parseExplainReport('{ version: 2, overview: [] }')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('the explain agent returned a malformed report object')
  })

  it('keeps the raw reply on every failure, for debugging the prompt', () => {
    const raw = 'nothing useful here'
    const result = parseExplainReport(raw)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.raw).toBe(raw)
  })

  it('caps how many issues it reports so a message stays readable', () => {
    const result = parse([
      { type: 'finding', severity: 'nit' },
      { type: 'unverified', items: [{}] },
      { type: 'systems', systems: [{}] },
      { type: 'questions', questions: [{}] },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('more)')
  })
})

describe('parseExplainReport — prose around the JSON', () => {
  it('tolerates a markdown fence', () => {
    const result = parseExplainReport(
      ['Here is the report:', '```json', reply([VERDICT]), '```'].join('\n'),
    )
    expect(result.ok).toBe(true)
  })

  it('tolerates leading and trailing prose', () => {
    const result = parseExplainReport(`I reviewed it.\n${reply([VERDICT])}\nHope that helps.`)
    expect(result.ok).toBe(true)
  })

  it('trims whitespace inside the strings it accepts', () => {
    const blocks = expectOk([{ ...VERDICT, headline: '  Two systems, one contract  ' }])
    expect(blocks[0]).toMatchObject({ headline: 'Two systems, one contract' })
  })

  it('rejects a whitespace-only required string', () => {
    expect(parse([{ ...VERDICT, headline: '   ' }]).ok).toBe(false)
  })
})
