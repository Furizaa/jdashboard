import { describe, expect, it } from 'vitest'
import type { ExplainBlock, ExplainDiffFile, ExplainMove } from '~/kernel'
import {
  findingCountOf,
  moveById,
  moveDiffFor,
  verdictIn,
  worstSeverityIn,
  worstSeverityOf,
} from './moves'

// Pure call/assert over the move rules (ADR-0010). The interesting ones are the
// severity roll-up — which is deliberately *derived* rather than stated by the
// agent — and the path matching the whole-diff expander needs, where "no match"
// is a result rather than an error.

const narrative: ExplainBlock = { type: 'narrative', body: 'It moved.' }

const finding = (severity: 'high' | 'medium' | 'low'): ExplainBlock => ({
  type: 'finding',
  system: 'pricing',
  title: `A ${severity} finding`,
  severity,
  whyItMatters: 'Something downstream breaks.',
})

function move(overrides: Partial<ExplainMove> = {}): ExplainMove {
  return {
    id: 'rounding-leaves-pricing',
    title: 'Rounding leaves the pricing service',
    summary: 'The service stops rounding and its callers start.',
    systems: ['pricing'],
    paths: ['src/pricing/quote.ts'],
    blocks: [narrative],
    ...overrides,
  }
}

function file(path: string, overrides: Partial<ExplainDiffFile> = {}): ExplainDiffFile {
  return {
    path,
    previousPath: null,
    status: 'modified',
    language: 'typescript',
    diff: '@@ -1 +1 @@\n-a\n+b',
    ...overrides,
  }
}

describe('worstSeverityOf', () => {
  it('is null for a move with no findings — the common case on a good MR', () => {
    expect(worstSeverityOf(move())).toBeNull()
  })

  it.each([
    [['low'], 'low'],
    [['medium'], 'medium'],
    [['high'], 'high'],
    [['low', 'high', 'medium'], 'high'],
    [['low', 'medium'], 'medium'],
  ] as const)('rolls %s up to %s', (severities, expected) => {
    const blocks = [narrative, ...severities.map(finding)]
    expect(worstSeverityOf(move({ blocks }))).toBe(expected)
  })

  it('ignores every cell that is not a finding', () => {
    const blocks: ExplainBlock[] = [
      narrative,
      { type: 'diff', path: 'a.ts', diff: '+x' },
      { type: 'diagram', mermaid: 'flowchart LR\n a-->b' },
    ]
    expect(worstSeverityOf(move({ blocks }))).toBeNull()
  })

  it('rolls up a bare block list the same way, for the overview', () => {
    expect(worstSeverityIn([finding('medium'), finding('low')])).toBe('medium')
    expect(worstSeverityIn([])).toBeNull()
  })
})

describe('findingCountOf', () => {
  it('counts only findings', () => {
    expect(findingCountOf(move({ blocks: [narrative, finding('low'), finding('high')] }))).toBe(2)
    expect(findingCountOf(move())).toBe(0)
  })
})

describe('verdictIn', () => {
  it('reads the verdict off the overview', () => {
    expect(verdictIn([{ type: 'verdict', verdict: 'blocked', headline: 'No' }])).toBe('blocked')
  })

  it('is null when there is no verdict cell', () => {
    expect(verdictIn([narrative])).toBeNull()
  })
})

describe('moveById', () => {
  const moves = [move(), move({ id: 'legacy-helper-deleted' })]

  it('finds a move by its slug', () => {
    expect(moveById(moves, 'legacy-helper-deleted')?.id).toBe('legacy-helper-deleted')
  })

  it.each([
    ['an unknown slug', 'long-gone'],
    ['no slug', null],
    ['an empty slug', ''],
  ])('is null for %s, so the page falls back to Overview', (_name, id) => {
    expect(moveById(moves, id)).toBeNull()
  })
})

describe('moveDiffFor', () => {
  it('returns the move’s files in the order the move names them', () => {
    const files = [file('src/checkout/total.ts'), file('src/pricing/quote.ts')]
    const { files: picked, missing } = moveDiffFor(
      ['src/pricing/quote.ts', 'src/checkout/total.ts'],
      files,
    )
    expect(picked.map((f) => f.path)).toEqual(['src/pricing/quote.ts', 'src/checkout/total.ts'])
    expect(missing).toEqual([])
  })

  it('leaves out files the move does not claim', () => {
    const files = [file('src/pricing/quote.ts'), file('src/unrelated/thing.ts')]
    expect(moveDiffFor(['src/pricing/quote.ts'], files).files).toHaveLength(1)
  })

  it('names a path the merge request no longer contains rather than dropping it', () => {
    // A report is pinned to one commit and the diff is read live, so a path that
    // has gone is itself a staleness signal — silence would hide it.
    const { files, missing } = moveDiffFor(
      ['src/pricing/quote.ts', 'src/gone.ts'],
      [file('src/pricing/quote.ts')],
    )
    expect(files).toHaveLength(1)
    expect(missing).toEqual(['src/gone.ts'])
  })

  it('matches a path the agent stated relative to a subdirectory', () => {
    const { files, missing } = moveDiffFor(['pricing/quote.ts'], [file('src/pricing/quote.ts')])
    expect(files.map((f) => f.path)).toEqual(['src/pricing/quote.ts'])
    expect(missing).toEqual([])
  })

  it('matches when the move states the longer path and GitLab the shorter one', () => {
    const { files } = moveDiffFor(['repo/src/quote.ts'], [file('src/quote.ts')])
    expect(files).toHaveLength(1)
  })

  it('includes a file matched by two of the move’s paths exactly once', () => {
    const only = file('src/pricing/quote.ts')
    const { files } = moveDiffFor(['src/pricing/quote.ts', 'pricing/quote.ts'], [only])
    expect(files).toEqual([only])
  })

  it('reports everything missing when the diff is empty', () => {
    expect(moveDiffFor(['src/a.ts', 'src/b.ts'], [])).toEqual({
      files: [],
      missing: ['src/a.ts', 'src/b.ts'],
    })
  })
})
