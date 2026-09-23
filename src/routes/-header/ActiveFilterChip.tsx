import { Filter, X } from 'lucide-react'
import { testIds } from '~/lib/testids'

// What stands where the search box used to. Filtering is now a deliberate
// palette command rather than live narrowing as you type, so an applied filter
// has to be visible somewhere — an invisible filter is indistinguishable from a
// board that has lost half its cards.
//
// The clear button is the chip's focusable part (the chip itself is a label, not
// a control), which is also what makes Escape-to-clear reachable by keyboard
// without putting a tabIndex on a non-interactive element.
export function ActiveFilterChip({ filter, onClear }: { filter: string; onClear: () => void }) {
  if (filter === '') return null

  return (
    <div
      role="status"
      data-testid={testIds.boardFilterChip}
      className="border-border bg-surface-1 text-ink-subtle inline-flex h-8 max-w-64 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs"
    >
      <Filter size={12} className="shrink-0" aria-hidden />
      <span className="truncate">
        Filtered: <span className="text-foreground font-medium">{filter}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        // Escape clears too, matching the gesture the deleted search input had.
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.currentTarget.blur()
          onClear()
        }}
        aria-label="Clear board filter"
        data-testid={testIds.boardFilterClear}
        className="hover:text-foreground focus-visible:ring-ring -mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </div>
  )
}
