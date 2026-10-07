import type {
  ExplainBlock,
  ExplainDiffFile,
  ExplainMove,
  ExplainSeverity,
  ExplainVerdict,
} from '~/kernel'
import { findingsOf, severityRank } from './block-altitude'

// The rules about **moves** — the logical changes a report is chaptered by
// (ADR-0010). The rail is a projection of these, and the projection lives in the
// view-model; what lives here are the three answers it needs that are rules
// rather than markup.
//
// Pure functions over kernel types. No I/O, no time, no framework.
//
// Notably **absent**: any re-ordering of the moves themselves. Their order is
// the agent's reading order — "understand this one before that one" — and
// re-sorting them by severity would be the view second-guessing the report's
// structure, which is exactly what `layOutReport`'s own comment forbids for
// blocks. Findings *within* a move are still ordered worst-first; that is the
// same rule applied one level down.

/**
 * A move's attention level: the worst severity among its own findings, or `null`
 * when it has none.
 *
 * Rolled up rather than stated by the agent, deliberately (ADR-0010 §4). A
 * severity field beside the findings it would be derived from is a second source
 * of truth for one fact, and the two would disagree eventually. `null` is the
 * honest answer for a move with nothing to flag — most moves, on a good merge
 * request — and the rail shows no dot rather than a reassuring green one.
 */
export function worstSeverityOf(move: ExplainMove): ExplainSeverity | null {
  return worstSeverityIn(move.blocks)
}

/** The same roll-up over a bare block list, for the overview. */
export function worstSeverityIn(blocks: readonly ExplainBlock[]): ExplainSeverity | null {
  return findingsOf(blocks).reduce<ExplainSeverity | null>(
    (worst, finding) =>
      worst === null || severityRank(finding.severity) < severityRank(worst)
        ? finding.severity
        : worst,
    null,
  )
}

/** How many findings a move raises — the count beside its dot in the rail. */
export function findingCountOf(move: ExplainMove): number {
  return findingsOf(move.blocks).length
}

/**
 * The move a `?move=` slug names, or `null`.
 *
 * `null` for an unknown slug rather than a throw or a nearest match: a link can
 * outlive the report it was written against — a re-run may have no move by that
 * name — and the honest response is to land on Overview, the same way a bad
 * `?mr=` lands on the list.
 */
export function moveById(moves: readonly ExplainMove[], id: string | null): ExplainMove | null {
  if (id === null || id === '') return null
  return moves.find((move) => move.id === id) ?? null
}

/**
 * The verdict a report reached, read off its overview blocks.
 *
 * The verdict stayed a *block* rather than being promoted to a field on the
 * report, so the renderers did not have to change — and the rail wants it as a
 * chip on the Overview entry, so that the conclusion is on screen from every
 * move without a second region of chrome to own it (ADR-0010 §2).
 */
export function verdictIn(blocks: readonly ExplainBlock[]): ExplainVerdict | null {
  const block = blocks.find((candidate) => candidate.type === 'verdict')
  return block === undefined ? null : block.verdict
}

export type MoveDiff = {
  /** The move's files, in the order the move names them. */
  readonly files: readonly ExplainDiffFile[]
  /**
   * Paths the move claims that the merge request's diff does not contain. Named
   * rather than dropped: a report is pinned to one commit and the diff is read
   * live, so a path that has gone is itself a staleness signal.
   */
  readonly missing: readonly string[]
}

/**
 * A file matches a move's path when the two name the same file. Exact first,
 * then either one as a suffix of the other — an agent writing from inside a
 * worktree sometimes states a path relative to a subdirectory, and GitLab always
 * states it relative to the repository root.
 */
function matches(file: ExplainDiffFile, movePath: string): boolean {
  if (file.path === movePath) return true
  return file.path.endsWith(`/${movePath}`) || movePath.endsWith(`/${file.path}`)
}

/**
 * The merge request's diff, narrowed to one move.
 *
 * In the move's own path order, because that is the order the move explains
 * itself in. A file matched by two of a move's paths appears once.
 */
export function moveDiffFor(paths: readonly string[], files: readonly ExplainDiffFile[]): MoveDiff {
  const picked: ExplainDiffFile[] = []
  const missing: string[] = []
  for (const path of paths) {
    const found = files.filter((file) => matches(file, path))
    if (found.length === 0) {
      missing.push(path)
      continue
    }
    for (const file of found) {
      if (!picked.includes(file)) picked.push(file)
    }
  }
  return { files: picked, missing }
}
