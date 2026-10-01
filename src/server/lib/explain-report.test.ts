import { describe, expect, it } from 'vitest'
import { EXPLAIN_REPORT_VERSION, parseExplainReport, type ExplainBlock } from './explain-report'

// The report is the contract between an untrusted agent and a typed UI, so
// everything here is hostile input. Table-driven over the eight block types
// first, then the ways a reply can be wrong.

function reply(blocks: readonly unknown[], version: unknown = EXPLAIN_REPORT_VERSION): string {
  return JSON.stringify({ version, blocks })
}

function parse(blocks: readonly unknown[], version?: unknown) {
  return parseExplainReport(reply(blocks, version))
}

function expectOk(blocks: readonly unknown[]): readonly ExplainBlock[] {
  const result = parse(blocks)
  if (!result.ok) throw new Error(`expected ok, got: ${result.error.message}`)
  return result.report.blocks
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

describe('parseExplainReport — every block type', () => {
  it.each(EVERY_BLOCK)('accepts a %s block', (_name, block) => {
    expect(expectOk([block])).toEqual([block])
  })

  it('accepts a whole report carrying all eight at once', () => {
    const blocks = EVERY_BLOCK.map(([, block]) => block)
    expect(expectOk(blocks)).toHaveLength(8)
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
    expect(result.error.message).toContain('blocks.0.system')
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

describe('parseExplainReport — malformed replies', () => {
  it('rejects an unknown block type', () => {
    const result = parse([VERDICT, { type: 'vibes', body: 'feels fine' }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('the explain report did not match the contract')
  })

  it('rejects a report version it does not implement', () => {
    expect(parse([VERDICT], 2).ok).toBe(false)
    expect(parse([VERDICT], '1').ok).toBe(false)
    // No version at all — an older agent, or a hand-rolled reply.
    expect(parseExplainReport(JSON.stringify({ blocks: [VERDICT] })).ok).toBe(false)
  })

  it('rejects an empty block list — a report with no blocks is not a report', () => {
    expect(parse([]).ok).toBe(false)
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
    const result = parseExplainReport('{ version: 1, blocks: [] }')
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
