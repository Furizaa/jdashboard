import type { ExplainBlock, ExplainBlockOf, ExplainSeverity } from '~/kernel'

// The altitude rules: how a report's blocks are ordered and grouped for an
// architect reading it fast.
//
// The *schema* already enforces altitude by what it cannot express — there is no
// `nit` severity, and a finding cannot exist without a system and a
// `whyItMatters` (ADR-0009 §7). What is left for this module is the reading
// order, which the agent should not be trusted to get right every time: the
// highest-severity finding goes first regardless of the order it was written in,
// and findings about one system stay together.
//
// Pure functions over kernel types. No I/O, no time, no framework.

/** Worst first. The order a reviewer wants, not the order the agent wrote in. */
export const SEVERITY_ORDER: Readonly<Record<ExplainSeverity, number>> = {
  high: 0,
  medium: 1,
  low: 2,
}

export function severityRank(severity: ExplainSeverity): number {
  return SEVERITY_ORDER[severity]
}

type Finding = ExplainBlockOf<'finding'>

/**
 * Findings worst-first, and within one severity grouped by system — so a
 * reviewer reads "everything wrong with pricing" together rather than
 * ping-ponging between systems. Ties keep the agent's own order, which is the
 * only signal left once severity and system agree.
 */
export function orderFindings(findings: readonly Finding[]): readonly Finding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .toSorted((a, b) => {
      const bySeverity = severityRank(a.finding.severity) - severityRank(b.finding.severity)
      if (bySeverity !== 0) return bySeverity
      const bySystem = a.finding.system.localeCompare(b.finding.system)
      if (bySystem !== 0) return bySystem
      return a.index - b.index
    })
    .map(({ finding }) => finding)
}

export type FindingGroup = {
  readonly system: string
  readonly findings: readonly Finding[]
  /** The worst severity in the group — what the group header is coloured by. */
  readonly worst: ExplainSeverity
}

/**
 * Findings grouped by the system they concern, groups ordered by their worst
 * finding. The grouping *is* the architect's view of a review: the unit of
 * concern is a system, not a file.
 */
export function groupFindingsBySystem(findings: readonly Finding[]): readonly FindingGroup[] {
  const bySystem = new Map<string, Finding[]>()
  for (const finding of orderFindings(findings)) {
    const group = bySystem.get(finding.system)
    if (group === undefined) bySystem.set(finding.system, [finding])
    else group.push(finding)
  }
  return [...bySystem.entries()]
    .map(([system, group]): FindingGroup => {
      const worst = group.reduce<ExplainSeverity>(
        (acc, f) => (severityRank(f.severity) < severityRank(acc) ? f.severity : acc),
        'low',
      )
      return { system, findings: group, worst }
    })
    .toSorted((a, b) => severityRank(a.worst) - severityRank(b.worst))
}

/** Pull the findings out of a report's blocks, keeping the rest untouched. */
export function findingsOf(blocks: readonly ExplainBlock[]): readonly Finding[] {
  return blocks.filter((block): block is Finding => block.type === 'finding')
}

/**
 * The page as the pane renders it: every explanatory cell first, in the agent's
 * own order, then the findings **grouped by system** with the worst-hit system
 * first, and the unverified list last of all.
 *
 * The findings **sink** (ADR-0011 §4). They used to be lifted in place, at the
 * position of the first one, which let a move page open with a warning — and a
 * page that opens with a warning is a code review, whatever the cells above it
 * were going to say. The explanation is what this surface is for; a finding is a
 * footnote on it. So the one thing the view re-orders is where the footnotes go.
 *
 * `unverified` stays at the bottom because it is the report's caveat, not part of
 * what it found, and it is the only cell the skill already pins to a position.
 * Everything else keeps the order the agent wrote it in: re-sorting the argument
 * itself would be the view second-guessing the report's structure, which it has
 * no business doing.
 */
export function layOutReport(blocks: readonly ExplainBlock[]): readonly ExplainBlock[] {
  const explanation = blocks.filter(
    (block) => block.type !== 'finding' && block.type !== 'unverified',
  )
  const findings = groupFindingsBySystem(findingsOf(blocks)).flatMap((group) => group.findings)
  const caveats = blocks.filter((block) => block.type === 'unverified')
  const laidOut = [...explanation, ...findings, ...caveats]
  // A page the agent already laid out this way is returned as it came, so an
  // unchanged report is identical rather than merely equal.
  return laidOut.every((block, index) => block === blocks[index]) ? blocks : laidOut
}
