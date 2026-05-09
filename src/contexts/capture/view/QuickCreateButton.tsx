import { Plus } from 'lucide-react'
import { useQuickCreate } from '../presenter'
import { QuickCreateModal } from './QuickCreateModal'

export function QuickCreateButton() {
  const qc = useQuickCreate()
  return (
    <>
      <button
        type="button"
        onClick={qc.openModal}
        title="New (c)"
        aria-keyshortcuts="c"
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        <Plus size={14} />
        <span>New</span>
        <kbd
          aria-hidden="true"
          className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground/90 ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none"
        >
          c
        </kbd>
      </button>
      <QuickCreateModal qc={qc} />
    </>
  )
}
