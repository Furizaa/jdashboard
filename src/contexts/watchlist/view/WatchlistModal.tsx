import { useRef } from 'react'
import { Search, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '~/design-system'
import { testIds } from '~/lib/testids'
import type { WatchlistModalApi } from '../presenter'
import { WatchlistResults } from './WatchlistResults'

export function WatchlistModal({ wl }: { wl: WatchlistModalApi }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={wl.open} onOpenChange={wl.setOpen}>
      <DialogContent
        showCloseButton={false}
        data-testid={testIds.watchlistModal}
        onEscapeKeyDown={(e) => {
          if (wl.isAdding) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (wl.isAdding) e.preventDefault()
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
        className="w-[min(34rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
      >
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <DialogTitle className="text-foreground text-[15px] font-semibold tracking-[-0.015em]">
              Add to Watchlist
            </DialogTitle>
            <DialogClose
              aria-label="Close"
              disabled={wl.isAdding}
              className={`text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                wl.isAdding ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <X size={14} />
            </DialogClose>
          </div>

          <div className="px-5 pb-3">
            <div className="border-border bg-surface-1 focus-within:border-border-strong focus-within:ring-ring flex items-center gap-2 rounded-md border px-2.5 focus-within:ring-2">
              <Search size={14} className="text-ink-subtle shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={wl.searchText}
                onChange={(e) => wl.setSearchText(e.target.value)}
                disabled={wl.isAdding}
                placeholder="Search Jira by summary or ticket number…"
                data-testid={testIds.watchlistSearchInput}
                className="text-foreground placeholder:text-ink-tertiary h-9 w-full bg-transparent text-[13px] outline-none disabled:opacity-50"
              />
            </div>
            {wl.error !== null && <p className="text-destructive mt-2 text-xs">{wl.error}</p>}
          </div>

          <div className="border-border min-h-0 flex-1 overflow-y-auto border-t px-2 py-2">
            <WatchlistResults
              results={wl.results}
              isAdding={wl.isAdding}
              onAdd={wl.add}
              onRetry={wl.retry}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
