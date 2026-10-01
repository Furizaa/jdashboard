import { ScanSearch } from 'lucide-react'
import { testIds } from '~/lib/testids'
import { useExplainHandoff, useMrRef } from '../presenter'

/**
 * Explain, in Detail's ACTIONS rail — where Review MR sat.
 *
 * Review MR spawned a cmux workspace running a diff viewer in a terminal. It
 * answered "what changed on line 44" and none of the questions an architect
 * actually reviews with. This button opens the Explain surface instead, which
 * answers the others (ADR-0009).
 *
 * It only **navigates**. The surface owns the run, so there is nothing pending
 * here and no failure to report — which is also what keeps Detail free of any
 * import from `contexts/explain`.
 */
export function ExplainMrButton({ issueKey }: { issueKey: string }) {
  const mr = useMrRef(issueKey)
  const explain = useExplainHandoff()
  if (mr === null) return null

  return (
    <button
      type="button"
      onClick={() => explain(mr.iid)}
      aria-label={`Explain merge request !${mr.iid}`}
      data-testid={testIds.explainMrButton}
      className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <ScanSearch size={12} />
      <span>Explain</span>
    </button>
  )
}
