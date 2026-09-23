import { workItemHaystack, workItemJiraKey, type WorkItem } from '~/kernel'
import type { PaletteCommand } from './palette-descriptors'

/**
 * Whitespace-split, case-insensitive, every-term-must-match — the semantics
 * `contexts/board/domain/filter-issues.ts` already has, lifted to any haystack.
 */
export function splitTerms(query: string): readonly string[] {
  return query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
}

function matchesAll(haystack: string, terms: readonly string[]): boolean {
  return terms.every((term) => haystack.includes(term))
}

// Ranking tiers. Typing a key you already know is the single most common palette
// action, so an exact or prefix hit on the Jira key must outrank a substring hit
// somewhere in a summary — otherwise "HDR-501" can be buried under three tickets
// that merely mention it.
const TIER_EXACT_KEY = 0
const TIER_KEY_PREFIX = 1
const TIER_SUBSTRING = 2

// Compared against the *first* term only: in "hdr-501 minimap" the key is what
// the user is steering by and the rest is a refinement.
function keyTier(item: WorkItem, firstTerm: string): number {
  const key = workItemJiraKey(item)?.toLowerCase()
  if (key === undefined) return TIER_SUBSTRING
  if (key === firstTerm) return TIER_EXACT_KEY
  if (key.startsWith(firstTerm)) return TIER_KEY_PREFIX
  return TIER_SUBSTRING
}

/**
 * Filter work items to those matching every term, then order by key-match
 * strength, ties keeping their incoming order. An empty query ranks nothing —
 * the incoming order (assigned, then watchlist, then review) is already the
 * sensible browse order.
 *
 * No fuzzy-match library: the haystack shape is already the right one, and a
 * scoring library would become the thing tests have to characterise.
 */
export function rankItems(items: readonly WorkItem[], query: string): readonly WorkItem[] {
  const terms = splitTerms(query)
  if (terms.length === 0) return items
  const firstTerm = terms[0] ?? ''
  return items
    .filter((item) => matchesAll(workItemHaystack(item), terms))
    .map((item, order) => ({ item, order, tier: keyTier(item, firstTerm) }))
    .toSorted((a, b) => a.tier - b.tier || a.order - b.order)
    .map((entry) => entry.item)
}

function commandHaystack(command: PaletteCommand): string {
  return [command.label, ...(command.synonyms ?? [])].join(' ').toLowerCase()
}

/**
 * The same term matching over a command's label plus its synonyms, so "create"
 * finds "New Ticket". Commands keep their declared order — it is curated, and
 * there is no key to rank by.
 */
export function rankCommands(
  commands: readonly PaletteCommand[],
  query: string,
): readonly PaletteCommand[] {
  const terms = splitTerms(query)
  if (terms.length === 0) return commands
  return commands.filter((command) => matchesAll(commandHaystack(command), terms))
}
