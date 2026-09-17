import { Plus, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '~/design-system'
import { testIds } from '~/lib/testids'
import type { TagManagerApi } from '../presenter'
import { TagColorPicker } from './TagColorPicker'
import { TagManagerRow } from './TagManagerRow'

// Define, rename, recolour, and delete local tags. Attaching a tag to a ticket
// happens elsewhere (the detail panel); this modal only curates the palette.
export function TagManagerModal({ manager }: { manager: TagManagerApi }) {
  const submit = () => void manager.submitDraft()
  return (
    <Dialog open={manager.open} onOpenChange={manager.setOpen}>
      <DialogContent
        showCloseButton={false}
        data-testid={testIds.tagManagerModal}
        className="w-[min(34rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
      >
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <DialogTitle className="text-foreground text-[15px] font-semibold tracking-[-0.015em]">
              Tags
            </DialogTitle>
            <DialogClose
              aria-label="Close"
              className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <X size={14} />
            </DialogClose>
          </div>

          <div className="border-border flex flex-col gap-2 border-b px-5 pb-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manager.draftName}
                onChange={(e) => manager.setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manager.canSubmit) submit()
                }}
                placeholder="New tag name…"
                maxLength={40}
                data-testid={testIds.tagNameInput}
                className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-within:border-border-strong focus-within:ring-ring h-9 flex-1 rounded-md border px-2.5 text-[13px] outline-none focus-within:ring-2"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!manager.canSubmit || manager.isCreating}
                data-testid={testIds.tagCreateButton}
                className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} />
                <span>Add</span>
              </button>
            </div>
            <TagColorPicker
              selectedColorId={manager.draftColorId}
              onSelect={manager.setDraftColor}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {manager.definitions.length === 0 ? (
              <p className="text-ink-tertiary py-4 text-center text-xs">
                No tags yet. Create one above.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {manager.definitions.map((tag) => (
                  <TagManagerRow key={tag.id} tag={tag} manager={manager} />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
