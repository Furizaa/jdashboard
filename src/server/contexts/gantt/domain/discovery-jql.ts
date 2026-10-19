import { assertIssueKey } from '../../../lib/jql'

// The one query a sync issues. `jiraSources` is a **list of epic keys, not a
// JQL string** (ADR-0012 §5): the server builds `parent in (...)` itself with
// `assertIssueKey` over every key, so no unvalidatable query is ever stored and
// the SKILL teaches a string array rather than a query language. Arbitrary JQL
// is the named upgrade path — `searchIssues(jql, fields)` already accepts it.
//
// Shaped after `watchlist/domain/candidate-jql.ts`: a pure string builder that
// quotes or asserts everything it interpolates, and nothing else.

/**
 * `['GEO-120', 'GEO-355']` → `parent in (GEO-120, GEO-355)`.
 *
 * Keys are interpolated **unquoted**, which is `candidate-jql.ts`'s `key = ...`
 * rule for the same reason: Jira does not resolve a quoted issue key. That is
 * safe only because `assertIssueKey` has already proved every key is
 * `PROJECT-123` and nothing else — the assertion is the quoting here.
 *
 * `null` for an empty list, and the caller then **skips the search**. An empty
 * `in ()` is a syntax error and the obvious repairs are worse: dropping the
 * clause would match every issue in the instance, and a sync that discovered
 * nothing would mark every mirrored node in the chart `orphaned`.
 */
export function discoveryJql(epicKeys: readonly string[]): string | null {
  if (epicKeys.length === 0) return null
  const keys = epicKeys.map((key, index) =>
    assertIssueKey(key, `discoveryJql: jiraSources[${index}]`),
  )
  return `parent in (${keys.join(', ')})`
}
