/**
 * `/gantt` lists the charts; `/gantt?chart=<id>` opens one (ADR-0012 §2).
 * `?issue=<KEY>` is the ticket detail panel's deep link, the same one both
 * boards carry, and `?node=<id>` reveals one lane inside the open chart — the
 * palette's `g` hand-off, filled in slice 96.
 */
export type GanttSearch = { chart?: string; issue?: string; node?: string }

/**
 * The slug shape `gantt-schema.ts` validates on the way in from the agent. Held
 * to here as well rather than trusted: a chart id is a folder name and a node id
 * a filename on the server, so a URL that is not a slug must never reach a
 * server function that would assert on it and throw.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/u

function slug(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return SLUG.test(trimmed) ? trimmed : undefined
}

/**
 * Validated the way `validateExplainSearch` and `validateBoardSearch` validate
 * theirs: the URL is hostile input until proven otherwise, and anything
 * malformed is **dropped rather than rejected** — a bad `?chart=` lands on the
 * chart list, not on an error.
 *
 * `issue` survives on its own, because the detail panel is a ticket reader and
 * does not need a chart to be useful. `node` does not: it names a lane *in a
 * chart*, so with no chart it identifies nothing and goes with it — exactly as
 * `validateBoardSearch` drops `notes` without `issue`.
 */
export function validateGanttSearch(search: Record<string, unknown>): GanttSearch {
  const issue =
    typeof search.issue === 'string' && search.issue.trim() !== '' ? search.issue : undefined
  const chart = slug(search.chart)
  if (chart === undefined) return { chart: undefined, issue, node: undefined }
  return { chart, issue, node: slug(search.node) }
}
