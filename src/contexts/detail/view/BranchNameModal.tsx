import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'

export function BranchNameModal({
  open,
  initialBranchName,
  issueKey,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  initialBranchName: string
  issueKey: string
  isPending: boolean
  onConfirm: (branchName: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialBranchName)

  useEffect(() => {
    if (open) setValue(initialBranchName)
  }, [open, initialBranchName])

  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0 && !isPending

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isPending && onCancel()}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => {
          if (isPending) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault()
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }}
        className="w-[min(28rem,calc(100vw-2rem))] gap-0 p-6 sm:max-w-[28rem]"
      >
        <DialogTitle className="text-foreground mb-1 text-[15px] font-semibold tracking-[-0.015em]">
          Open workspace for {issueKey}
        </DialogTitle>
        <p className="text-ink-subtle mb-4 text-xs">
          A new worktree will be created from <code>origin/develop</code>.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) onConfirm(trimmed)
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label
              htmlFor="branch-name-input"
              className="text-ink-subtle mb-1.5 block text-[11px] font-medium tracking-wide"
            >
              Branch name
            </label>
            <input
              id="branch-name-input"
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={isPending}
              spellCheck={false}
              autoComplete="off"
              className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-visible:ring-ring focus:border-border-strong w-full rounded-md border px-2.5 py-2 font-mono text-[13px] transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            />
          </div>
          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              <span>Open Workspace</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
