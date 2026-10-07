import { createFileRoute } from '@tanstack/react-router'
import { ExplainShell } from './-explain/ExplainShell'

/**
 * `/explain` lists the open reviews; `/explain?mr=123` selects one (ADR-0009 §2),
 * and `?move=<slug>` opens one move inside it (ADR-0010).
 */
export type ExplainSearch = { mr?: number; move?: string }

/** The slug shape `explainMoveSchema` validates on the way in from the agent. */
const MOVE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const MOVE_ID_MAX = 80

/**
 * Validated the way `validateBoardSearch` validates `issue`: the URL is hostile
 * input until proven otherwise. An iid is a positive integer, and it arrives as
 * a string from a hand-typed or pasted link, so both forms are accepted and
 * everything else is dropped rather than rejected — a bad `?mr=` lands on the
 * list, not on an error.
 *
 * `?move=` is dropped the same way when it is not slug-shaped. A slug that *is*
 * well-formed but names no move in the report is a different case and not this
 * layer's to judge: the report may not even be loaded yet, so the view-model
 * resolves an unknown move to Overview once it has one to check against.
 */
export function validateExplainSearch(search: Record<string, unknown>): ExplainSearch {
  const raw = search.mr
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^[1-9]\d*$/u.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN
  const mr = Number.isInteger(value) && value > 0 ? value : undefined
  const rawMove = search.move
  const move =
    typeof rawMove === 'string' &&
    rawMove.trim().length <= MOVE_ID_MAX &&
    MOVE_ID.test(rawMove.trim())
      ? rawMove.trim()
      : undefined
  // A move with no merge request names nothing, so it goes with it.
  return mr === undefined ? { mr: undefined, move: undefined } : { mr, move }
}

export const Route = createFileRoute('/explain')({
  component: ExplainPage,
  validateSearch: validateExplainSearch,
})

function ExplainPage() {
  const { mr, move } = Route.useSearch()
  return <ExplainShell mr={mr} move={move} />
}
