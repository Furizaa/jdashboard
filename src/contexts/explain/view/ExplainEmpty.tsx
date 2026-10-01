import { ScanSearch } from 'lucide-react'
import { testIds } from '~/lib/testids'

/** The surface with no review open, and the surface with none selected. */
export function ExplainEmpty({ openCount }: { openCount: number }) {
  return (
    <div
      data-testid={testIds.explainEmpty}
      className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
    >
      <ScanSearch size={28} className="text-ink-tertiary" aria-hidden />
      {openCount === 0 ? (
        <>
          <p className="text-foreground text-sm font-medium">No reviews open</p>
          <p className="text-ink-subtle max-w-sm text-xs leading-relaxed">
            Run <span className="text-foreground font-medium">Explain</span> on a ticket with a
            merge request — from the detail panel, or with{' '}
            <kbd className="border-border bg-surface-2 text-foreground rounded border px-1 py-0.5 font-mono text-[10px]">
              v
            </kbd>{' '}
            in the command palette — and the review opens as a tab here.
          </p>
        </>
      ) : (
        <>
          <p className="text-foreground text-sm font-medium">Pick a review</p>
          <p className="text-ink-subtle text-xs">
            {openCount === 1 ? 'One review is' : `${openCount} reviews are`} open above.
          </p>
        </>
      )}
    </div>
  )
}
