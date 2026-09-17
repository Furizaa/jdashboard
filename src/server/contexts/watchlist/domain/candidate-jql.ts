import { quoteJqlString } from '../../../lib/jql'

// Lenient issue-key shape (case-insensitive) used only to decide whether to add
// a `key = ...` clause to a free-text search — the strict `assertIssueKey`
// pattern is enforced when a key is actually persisted.
const KEY_LIKE = /^[A-Za-z][A-Za-z0-9]+-[1-9]\d*$/u

// Free-text search across all accessible projects: a summary wildcard, plus an
// exact key match when the text looks like an issue key (so typing a ticket
// number like "HDR-19244" finds it directly). The key is matched unquoted —
// Jira does not resolve a quoted issue key. Ordered newest-first.
export function buildCandidateJql(text: string): string {
  const clauses = [`summary ~ ${quoteJqlString(`${text}*`)}`]
  if (KEY_LIKE.test(text)) {
    clauses.unshift(`key = ${text.toUpperCase()}`)
  }
  return `(${clauses.join(' OR ')}) ORDER BY updated DESC`
}

// Hydrate the persisted keys back into full cards. Mirrors review's bulk lookup.
export function buildKeysInJql(keys: readonly string[]): string {
  return `key in (${keys.map(quoteJqlString).join(', ')}) ORDER BY updated DESC`
}
