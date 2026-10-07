/**
 * `/explain` lists the open reviews; `/explain?mr=123` selects one (ADR-0009 §2),
 * and `?move=<slug>` opens one move inside it (ADR-0010).
 */
export type ExplainSearch = { mr?: number; move?: string }

/** The slug shape `explainMoveSchema` validates on the way in from the agent. */
const MOVE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const MOVE_ID_MAX = 80
const POSITIVE_INT = /^[1-9]\d*$/u

/**
 * A positive integer. It arrives as a number from a router-made link and as a
 * string from a hand-typed or pasted one, so both are normalised to text and
 * held to the same pattern — which rejects `1.5`, `-1`, `1e21` and `01` without
 * a separate rule for each.
 */
function positiveIid(raw: unknown): number | undefined {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  if (!POSITIVE_INT.test(text)) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : undefined
}

/**
 * A well-formed move slug, or nothing. Whether it names a move *in the report*
 * is a different question and not this layer's to judge: the report may not even
 * be loaded yet, so the view-model resolves an unknown move to Overview once it
 * has one to check against.
 */
function moveSlug(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const slug = raw.trim()
  if (slug.length > MOVE_ID_MAX || !MOVE_ID.test(slug)) return undefined
  return slug
}

/**
 * Validated the way `validateBoardSearch` validates `issue`: the URL is hostile
 * input until proven otherwise, and anything malformed is **dropped rather than
 * rejected** — a bad `?mr=` lands on the list, not on an error.
 */
export function validateExplainSearch(search: Record<string, unknown>): ExplainSearch {
  const mr = positiveIid(search.mr)
  // A move with no merge request names nothing, so it goes with it.
  if (mr === undefined) return { mr: undefined, move: undefined }
  return { mr, move: moveSlug(search.move) }
}
