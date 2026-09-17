import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from '~/coordinator/adapters/tanstack-cache'
import { resolveTicketTags, type TagDefinition, type TagsState } from '~/kernel'
import { getTagsState } from '~/server/server-functions/tags'

// One shared query feeds three consumers — the tag manager, the per-card tag
// rows, and the detail-panel controls — with react-query deduping by key and a
// per-consumer `select` narrowing the shape (mirrors the watchlist query). Tags
// are purely local state, so there is no gating on the Jira board load.
const TAGS_QUERY = {
  queryKey: DASHBOARD_QUERY_KEYS.tags,
  queryFn: () => getTagsState(),
  retry: false,
  staleTime: DASHBOARD_STALE_TIMES.tags,
} as const

export function useTagsState(): UseQueryResult<TagsState> {
  return useQuery(TAGS_QUERY)
}

// The full palette of defined tags — the manager list and the detail-panel
// attach picker both enumerate these.
export function useTagDefinitions(): readonly TagDefinition[] {
  const query = useQuery({ ...TAGS_QUERY, select: (data) => data.definitions })
  return query.data ?? []
}

// The tags attached to one ticket, resolved to definitions in attachment order.
// Consumed per-card (like `useMrFor`) and by the detail-panel controls.
export function useTicketTags(issueKey: string): readonly TagDefinition[] {
  const query = useQuery({
    ...TAGS_QUERY,
    select: (data) => resolveTicketTags(data, issueKey),
  })
  return query.data ?? []
}
