import { createFileRoute } from '@tanstack/react-router'
import { ExplainShell } from './-explain/ExplainShell'

/** `/explain` lists the open reviews; `/explain?mr=123` selects one (ADR-0009 §2). */
export type ExplainSearch = { mr?: number }

/**
 * Validated the way `validateBoardSearch` validates `issue`: the URL is hostile
 * input until proven otherwise. An iid is a positive integer, and it arrives as
 * a string from a hand-typed or pasted link, so both forms are accepted and
 * everything else is dropped rather than rejected — a bad `?mr=` lands on the
 * list, not on an error.
 */
export function validateExplainSearch(search: Record<string, unknown>): ExplainSearch {
  const raw = search.mr
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^[1-9]\d*$/u.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN
  return Number.isInteger(value) && value > 0 ? { mr: value } : { mr: undefined }
}

export const Route = createFileRoute('/explain')({
  component: ExplainPage,
  validateSearch: validateExplainSearch,
})

function ExplainPage() {
  const { mr } = Route.useSearch()
  return <ExplainShell mr={mr} />
}
