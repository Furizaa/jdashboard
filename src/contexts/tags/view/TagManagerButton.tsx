import { Tags } from 'lucide-react'
import { testIds } from '~/lib/testids'
import { useTagManager } from '../presenter'
import { TagManagerModal } from './TagManagerModal'

export function TagManagerButton() {
  const manager = useTagManager()
  return (
    <>
      <button
        type="button"
        onClick={manager.openModal}
        title="Define local tags to attach to tickets"
        data-testid={testIds.tagManagerButton}
        className="border-border text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Tags size={14} />
        <span>Tags</span>
      </button>
      <TagManagerModal manager={manager} />
    </>
  )
}
