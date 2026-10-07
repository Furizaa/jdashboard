import { describe, expect, it } from 'vitest'
import type { ExplainBlock, ExplainBlockOf, ExplainSeverity } from '~/kernel'
import {
  findingsOf,
  groupFindingsBySystem,
  layOutReport,
  orderFindings,
  severityRank,
} from './block-altitude'

function finding(
  system: string,
  severity: ExplainSeverity,
  title = `${system}-${severity}`,
): ExplainBlockOf<'finding'> {
  return { type: 'finding', system, severity, title, whyItMatters: 'because' }
}

const VERDICT: ExplainBlock = { type: 'verdict', verdict: 'discuss', headline: 'hm' }
const NARRATIVE: ExplainBlock = { type: 'narrative', body: 'prose' }
const UNVERIFIED: ExplainBlock = {
  type: 'unverified',
  items: [{ claim: 'the suite passes', why: 'nothing is installed in the worktree' }],
}
const BLAST: ExplainBlock = {
  type: 'blast-radius',
  rows: [{ surface: 'POST /x', ifWrong: 'boom', downstream: [], likelihood: 'low' }],
}

describe('severityRank', () => {
  it('orders worst first', () => {
    expect(severityRank('high')).toBeLessThan(severityRank('medium'))
    expect(severityRank('medium')).toBeLessThan(severityRank('low'))
  })
})

describe('orderFindings', () => {
  it('puts the worst first, whatever order the agent wrote them in', () => {
    const ordered = orderFindings([
      finding('pricing', 'low'),
      finding('billing', 'high'),
      finding('checkout', 'medium'),
    ])
    expect(ordered.map((f) => f.severity)).toEqual(['high', 'medium', 'low'])
  })

  it('groups one severity by system, so a reviewer reads one system at a time', () => {
    const ordered = orderFindings([
      finding('pricing', 'high', 'a'),
      finding('billing', 'high', 'b'),
      finding('pricing', 'high', 'c'),
    ])
    expect(ordered.map((f) => f.system)).toEqual(['billing', 'pricing', 'pricing'])
  })

  it('keeps the agent’s own order on a full tie', () => {
    // Severity and system agree, so the agent's sequence is the only signal left.
    const ordered = orderFindings([
      finding('pricing', 'high', 'first'),
      finding('pricing', 'high', 'second'),
    ])
    expect(ordered.map((f) => f.title)).toEqual(['first', 'second'])
  })

  it('returns an empty list unchanged', () => {
    expect(orderFindings([])).toEqual([])
  })
})

describe('groupFindingsBySystem', () => {
  it('groups by system and orders groups by their worst finding', () => {
    const groups = groupFindingsBySystem([
      finding('reporting', 'low'),
      finding('pricing', 'medium'),
      finding('billing', 'high'),
      finding('pricing', 'high'),
    ])
    expect(groups.map((g) => g.system)).toEqual(['billing', 'pricing', 'reporting'])
    expect(groups.map((g) => g.worst)).toEqual(['high', 'high', 'low'])
  })

  it('keeps every finding of a system together', () => {
    const groups = groupFindingsBySystem([
      finding('pricing', 'high', 'a'),
      finding('pricing', 'low', 'b'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.findings.map((f) => f.title)).toEqual(['a', 'b'])
  })

  it('groups nothing into nothing', () => {
    expect(groupFindingsBySystem([])).toEqual([])
  })
})

describe('findingsOf', () => {
  it('picks the findings out and leaves the rest alone', () => {
    expect(findingsOf([VERDICT, finding('pricing', 'high'), NARRATIVE])).toHaveLength(1)
  })
})

describe('layOutReport', () => {
  it('groups the findings by system, worst-hit system first', () => {
    // An architect reads "everything wrong with pricing" together rather than
    // ping-ponging between systems.
    const laidOut = layOutReport([
      finding('reporting', 'medium', 'reporting-med'),
      finding('pricing', 'low', 'pricing-low'),
      finding('pricing', 'high', 'pricing-high'),
    ])
    expect(laidOut.filter((b) => b.type === 'finding').map((b) => b.title)).toEqual([
      'pricing-high',
      'pricing-low',
      'reporting-med',
    ])
  })

  it('sinks the findings below the explanation, keeping that in the agent’s order', () => {
    // ADR-0011 §4: the explanation is the deliverable and a finding is a
    // footnote on it, so the cells that explain stay where they were written and
    // the findings go underneath them.
    const laidOut = layOutReport([
      VERDICT,
      NARRATIVE,
      finding('pricing', 'low', 'low-one'),
      finding('billing', 'high', 'high-one'),
      BLAST,
    ])
    expect(laidOut.map((block) => block.type)).toEqual([
      'verdict',
      'narrative',
      'blast-radius',
      'finding',
      'finding',
    ])
    expect(laidOut.filter((b) => b.type === 'finding').map((b) => b.title)).toEqual([
      'high-one',
      'low-one',
    ])
  })

  it('sinks a single finding too — a page may not open with a warning', () => {
    const laidOut = layOutReport([finding('pricing', 'low', 'only'), NARRATIVE])
    expect(laidOut.map((b) => b.type)).toEqual(['narrative', 'finding'])
  })

  it('keeps the unverified list last, under the findings', () => {
    // It is the report's caveat rather than part of what it found.
    const laidOut = layOutReport([NARRATIVE, UNVERIFIED, finding('pricing', 'high')])
    expect(laidOut.map((b) => b.type)).toEqual(['narrative', 'finding', 'unverified'])
  })

  it('returns a page that is already laid out this way unchanged', () => {
    const blocks = [VERDICT, NARRATIVE, finding('pricing', 'low'), UNVERIFIED]
    expect(layOutReport(blocks)).toBe(blocks)
  })

  it('leaves a page with no findings untouched', () => {
    const blocks = [VERDICT, NARRATIVE]
    expect(layOutReport(blocks)).toBe(blocks)
  })

  it('collects findings scattered through the page into one run at the bottom', () => {
    const laidOut = layOutReport([finding('a', 'low', 'x'), NARRATIVE, finding('b', 'high', 'y')])
    expect(laidOut.map((b) => b.type)).toEqual(['narrative', 'finding', 'finding'])
  })
})
