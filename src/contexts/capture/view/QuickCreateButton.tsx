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
        className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Plus size={14} strokeWidth={2.5} />
        <span>New</span>
        <kbd
          aria-hidden="true"
          className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground/90 ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none"
        >
          c
        </kbd>
      </button>
      <QuickCreateModal qc={qc} />
    </>
  )
}
