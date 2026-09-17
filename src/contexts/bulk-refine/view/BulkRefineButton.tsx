import { Wand2 } from 'lucide-react'
import { testIds } from '~/lib/testids'
import { useBulkRefine } from '../presenter'
import { BulkRefineModal } from './BulkRefineModal'

// Board-level Bulk Refine: paste one meeting transcript and refine every ticket
// on the board (or watchlist) that the meeting discussed. Wears the same
// animated rainbow ring as the per-ticket Refine button; owns its own modal, so
// the Header just drops it in like QuickCreateButton / WatchlistButton.
export function BulkRefineButton() {
  const bulk = useBulkRefine()
  return (
    <>
      <button
        type="button"
        onClick={bulk.open}
        data-testid={testIds.bulkRefineButton}
        aria-label="Bulk refine notes from a meeting transcript"
        title="Bulk refine from a meeting transcript"
        className="refine-rainbow-border text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Wand2 size={14} />
        <span>Bulk Refine</span>
      </button>
      <BulkRefineModal bulk={bulk} />
    </>
  )
}
