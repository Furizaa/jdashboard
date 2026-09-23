import { Eye } from 'lucide-react'
import { testIds } from '~/lib/testids'
import { useRegisterCommand } from '~/coordinator/adapters/command-bus'
import { useWatchlistModal } from '../presenter'
import { WatchlistModal } from './WatchlistModal'

export function WatchlistButton() {
  const wl = useWatchlistModal()
  // The palette opens this modal through the command bus; the button keeps
  // owning its state (ADR-0008).
  useRegisterCommand('add-to-watchlist', wl.openModal)
  return (
    <>
      <button
        type="button"
        onClick={wl.openModal}
        title="Add a ticket you advise on to your watchlist"
        data-testid={testIds.watchlistButton}
        className="border-border text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Eye size={14} />
        <span>Watchlist</span>
      </button>
      <WatchlistModal wl={wl} />
    </>
  )
}
