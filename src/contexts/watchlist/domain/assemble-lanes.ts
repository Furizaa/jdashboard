import type { BoardIssue, TagDefinition, TagsState, WatchlistLaneConfig } from '~/kernel'

// The Watchlist Board projects watchlist cards onto tag-filtered swimlanes. Each
// configured lane is bound to one or more tags; a card is placed in a lane when
// it carries *any* of that lane's tags (union). A card is placed in *every* lane
// it matches (a card matching two lanes shows in both). Cards with no tag, or no
// tag matching any configured lane, are dropped — they never render on this
// board. This is the watchlist-board analogue of `board/assembleColumns`.

export type WatchlistLane = {
  /** Stable lane id (from the configuration) — drives the React key and the
   * per-lane collapsed state. */
  readonly id: string
  /** The live tags this lane collects, in configured order (deleted tags dropped). */
  readonly tags: readonly TagDefinition[]
  /** Watchlist cards carrying any of this lane's tags, in incoming (server) order. */
  readonly items: readonly BoardIssue[]
}

function matchesSearch(issue: BoardIssue, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = `${issue.key} ${issue.summary}`.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

// A configured lane whose tags were all since deleted is skipped (it has nothing
// live to bind to). A lane with at least one live tag and no matching cards is
// kept — it is a real, configured lane, just empty.
export function assembleLanes(input: {
  cards: readonly BoardIssue[]
  tagsState: TagsState
  lanes: readonly WatchlistLaneConfig[]
  searchQuery: string
}): readonly WatchlistLane[] {
  const { cards, tagsState, lanes, searchQuery } = input
  const defsById = new Map(tagsState.definitions.map((d) => [d.id, d]))
  const visible = cards.filter((issue) => matchesSearch(issue, searchQuery))
  const result: WatchlistLane[] = []
  for (const lane of lanes) {
    const tags = lane.tagIds.flatMap((id) => {
      const def = defsById.get(id)
      return def === undefined ? [] : [def]
    })
    if (tags.length === 0) continue
    const laneTagIds = new Set(tags.map((t) => t.id))
    const items = visible.filter((issue) =>
      (tagsState.attachments[issue.key] ?? []).some((id) => laneTagIds.has(id)),
    )
    result.push({ id: lane.id, tags, items })
  }
  return result
}
