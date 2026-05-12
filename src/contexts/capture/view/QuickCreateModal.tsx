import { useRef } from 'react'
import { Loader2, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '~/design-system'
import type { QuickCreateApi } from '../presenter'
import { QuickCreateForm } from './QuickCreateForm'

export function QuickCreateModal({ qc }: { qc: QuickCreateApi }) {
  const summaryRef = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={qc.open} onOpenChange={qc.setOpen}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (qc.isPending) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (qc.isPending) e.preventDefault()
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          summaryRef.current?.focus()
        }}
        className="w-[min(32rem,calc(100vw-2rem))] gap-0 p-6 sm:max-w-[32rem]"
      >
        <div className="mb-5 flex items-center justify-between">
          <DialogTitle className="text-foreground text-[15px] font-semibold tracking-[-0.015em]">
            Quick Create
          </DialogTitle>
          <DialogClose
            aria-label="Close"
            disabled={qc.isPending}
            className={`text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              qc.isPending ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <X size={14} />
          </DialogClose>
        </div>
        <div className={qc.isPending ? 'hidden' : ''}>
          <QuickCreateForm
            summaryRef={summaryRef}
            open={qc.open}
            isPending={qc.isPending}
            onCancel={qc.closeModal}
            onSubmit={qc.submit}
            registerReset={qc.registerReset}
          />
        </div>
        {qc.isPending && (
          <div className="flex flex-col items-center justify-center gap-3 py-14">
            <Loader2 className="text-primary h-7 w-7 animate-spin" strokeWidth={2} />
            <span className="text-foreground text-sm">Creating your ticket…</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
