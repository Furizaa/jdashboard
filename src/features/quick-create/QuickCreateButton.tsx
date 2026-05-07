import { useState } from 'react'
import { Plus } from 'lucide-react'
import { QuickCreateModal } from './QuickCreateModal'

export function QuickCreateButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        <Plus size={14} />
        <span>New</span>
      </button>
      <QuickCreateModal open={open} setOpen={setOpen} />
    </>
  )
}
