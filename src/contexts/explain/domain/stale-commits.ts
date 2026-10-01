// "Does this report still describe the merge request?"
//
// A report is pinned to the commit it was generated from (ADR-0009 §5), which is
// the only way it can be reproducible. The corollary is that the MR can move on
// underneath it, and an architect reviewing a tree three pushes old without
// knowing is the exact failure the detached checkout was chosen to prevent.
//
// Pure over two SHAs. `null` for the current head is honest ignorance — GitLab
// was unreachable — and is reported as such rather than collapsed into "fine".

export type ReportFreshness = 'current' | 'moved-on' | 'unknown'

export function reportFreshness(reportedSha: string, currentSha: string | null): ReportFreshness {
  if (currentSha === null || currentSha === '' || reportedSha === '') return 'unknown'
  return reportedSha === currentSha ? 'current' : 'moved-on'
}

/** Seven characters, the length git itself abbreviates to in most output. */
const SHORT_SHA_LENGTH = 7

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH)
}

/**
 * What the tab says about freshness, or `null` when there is nothing worth
 * saying. "Current" gets no banner: a report that is up to date should be read,
 * not reassured about.
 *
 * The message names the new head rather than counting commits: counting would
 * need a compare call GitLab has not been asked for, and a number nobody checked
 * is worse than a SHA they can.
 */
export function freshnessWarning(reportedSha: string, currentSha: string | null): string | null {
  switch (reportFreshness(reportedSha, currentSha)) {
    case 'moved-on':
      return `This report describes ${shortSha(reportedSha)}. The MR has moved on since — its head is now ${shortSha(currentSha ?? '')}. Re-run to review the current tree.`
    case 'unknown':
      return reportedSha === ''
        ? null
        : `This report describes ${shortSha(reportedSha)}. GitLab could not be reached, so whether the MR has moved on since is unknown.`
    case 'current':
      return null
  }
}
