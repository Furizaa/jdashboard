const MAX_DISPLAY_LENGTH = 40
const ELLIPSIS = '…'
const BROWSE_PATH_RE = /^\/browse\/([A-Z][A-Z0-9]+-\d+)/u

export type InlineCardKind =
  | { _tag: 'JiraIssue'; issueKey: string; url: string }
  | { _tag: 'PlainUrl'; url: string; display: string }

export function parseInlineCard(url: string, jiraBaseUrl: string | null): InlineCardKind {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { _tag: 'PlainUrl', url, display: url }
  }

  if (jiraBaseUrl !== null && jiraBaseUrl !== '') {
    let parsedBase: URL | null = null
    try {
      parsedBase = new URL(jiraBaseUrl)
    } catch {
      parsedBase = null
    }
    if (parsedBase !== null && parsed.host.toLowerCase() === parsedBase.host.toLowerCase()) {
      const match = BROWSE_PATH_RE.exec(parsed.pathname)
      if (match !== null) {
        return { _tag: 'JiraIssue', issueKey: match[1]!, url }
      }
    }
  }

  const hostPath = stripTrailingSlash(parsed.host + parsed.pathname)
  return { _tag: 'PlainUrl', url, display: truncate(hostPath, MAX_DISPLAY_LENGTH) }
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') && s.length > 1 ? s.slice(0, -1) : s
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + ELLIPSIS
}
