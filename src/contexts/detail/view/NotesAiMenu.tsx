import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MessageCircleQuestion, Sparkles } from 'lucide-react'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'

// The AI affordance beside the Write/Read toggle. The old bare "Refine" button is now
// the trigger for a small menu of two big options — Refine (rewrite the note) and Ask
// (answer a question, read-only). Keeps the familiar animated rainbow ring
// (`.refine-rainbow`, defined in globals.css). Open/close is trivial local state
// (useState + outside-click + Escape), so it stays a plain view with no view-model —
// matching the status-pill dropdown's inline approach.
export function NotesAiMenu({ onRefine, onAsk }: { onRefine: () => void; onAsk: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={testIds.notesAiMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="AI note actions"
        className="refine-rainbow bg-surface-2 text-foreground hover:bg-surface-3 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Sparkles size={13} className="text-[#c084fc]" />
        <span>AI</span>
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="border-border bg-card absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border p-1.5 shadow-xl"
        >
          <MenuItem
            testId={testIds.notesAiMenuRefine}
            icon={<Sparkles size={16} className="text-[#c084fc]" />}
            title="Refine"
            description="Rewrite the note from pasted text or an instruction."
            onClick={() => choose(onRefine)}
          />
          <MenuItem
            testId={testIds.notesAiMenuAsk}
            icon={<MessageCircleQuestion size={16} className="text-[#5eead4]" />}
            title="Ask"
            description="Answer a question about this ticket. Read-only — never edits the note."
            onClick={() => choose(onAsk)}
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({
  testId,
  icon,
  title,
  description,
  onClick,
}: {
  testId: string
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      data-testid={testId}
      className="hover:bg-surface-2 focus-visible:ring-ring flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="border-border bg-surface-1 mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-semibold">{title}</span>
        <span className="text-ink-subtle block text-xs leading-snug">{description}</span>
      </span>
    </button>
  )
}
