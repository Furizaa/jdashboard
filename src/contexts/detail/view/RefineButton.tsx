import { Sparkles } from 'lucide-react'
import { testIds } from '~/lib/testids'

// The "Refine" affordance beside the Write/Read toggle: an AI action wearing the
// familiar animated rainbow ring (the `.refine-rainbow` ring + glow live in
// globals.css). Opens the paste-and-refine modal; the rewrite itself runs in a
// headless agent server-side.
export function RefineButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testIds.notesRefineButton}
      aria-label="Refine note with AI"
      className="refine-rainbow bg-surface-2 text-foreground hover:bg-surface-3 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <Sparkles size={13} className="text-[#c084fc]" />
      <span>Refine</span>
    </button>
  )
}
