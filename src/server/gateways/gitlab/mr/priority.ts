// GitLab carries MR priority as a single mutually-exclusive scoped label
// `priority::<value>`. "hotfix" is one of the values, not a separate label, so
// an MR has at most one priority. An MR with no `priority::*` label has none.
export type MrPriority = 'hotfix' | 'high' | 'normal' | 'low'

const PRIORITY_SCOPE = 'priority::'

const KNOWN: Record<string, MrPriority> = {
  hotfix: 'hotfix',
  high: 'high',
  normal: 'normal',
  low: 'low',
}

// Returns the MR's priority, or null when it carries no known `priority::*`
// label. Matching is case-insensitive; an unknown value under the scope is
// ignored rather than guessed at.
export function mrPriorityFromLabels(labels: readonly string[]): MrPriority | null {
  for (const label of labels) {
    const lower = label.toLowerCase()
    if (!lower.startsWith(PRIORITY_SCOPE)) continue
    const value = KNOWN[lower.slice(PRIORITY_SCOPE.length)]
    if (value !== undefined) return value
  }
  return null
}

export const MR_PRIORITY_LABEL: Record<MrPriority, string> = {
  hotfix: 'Hotfix',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
}
