import { Schema } from 'effect'
import { JiraUnauthorized } from '../../gateways/jira/errors'

// Both watchlist read paths (hydrate cards, search candidates) build server-side
// JQL against a read-only endpoint, so — like `loadBoard` — only `Unauthorized`
// is surfaced; `NotFound` / `Rejected` / `TransportError` are demoted to defects
// via `dieOn` in the application services.
export const LoadWatchlistCardsError = Schema.Union(JiraUnauthorized)
export const SearchCandidatesError = Schema.Union(JiraUnauthorized)
