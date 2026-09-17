const WORKSPACE_NAME_PREFIX = 'GeoCloud'
const MAX_TITLE_WORDS = 3

// Same issue-key shape as the server's `issueKeysInName`, bounded so `HDR-1`
// never matches inside `HDR-19`. Used to enforce the mandatory ticket number
// in a workspace name.
const ISSUE_KEY_IN_NAME = /(?<![A-Za-z0-9])[A-Z][A-Z0-9]+-[1-9]\d*(?![0-9A-Za-z])/gu

function titleWords(title: string): string[] {
  return title
    .split(/\s+/u)
    .map((word) => word.replaceAll(/[^A-Za-z0-9]/gu, ''))
    .filter((word) => word.length > 0)
    .slice(0, MAX_TITLE_WORDS)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
}

// The pre-filled workspace name, e.g. `GeoCloud Trajectory Minimap HDR-19529`.
// Falls back to `GeoCloud HDR-19529` when the title yields no usable words.
export function defaultWorkspaceName(input: { issueKey: string; title: string }): string {
  const slug = titleWords(input.title).join(' ')
  return slug.length > 0
    ? `${WORKSPACE_NAME_PREFIX} ${slug} ${input.issueKey}`
    : `${WORKSPACE_NAME_PREFIX} ${input.issueKey}`
}

// Whether the workspace name carries the ticket key as a standalone token —
// the mandatory-ticket-number rule the create modal enforces.
export function workspaceNameHasKey(name: string, issueKey: string): boolean {
  const matches: readonly string[] = name.match(ISSUE_KEY_IN_NAME) ?? []
  return matches.includes(issueKey)
}
