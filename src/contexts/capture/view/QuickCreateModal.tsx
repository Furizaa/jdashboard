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
        className="w-[min(32rem,calc(100vw-2rem))] gap-0 p-5 sm:max-w-[32rem]"
      >
        <div className="mb-4 flex items-center justify-between">
          <DialogTitle className="text-foreground text-sm font-semibold">Quick Create</DialogTitle>
          <DialogClose
            aria-label="Close"
            disabled={qc.isPending}
            className={`text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:ring-1 focus-visible:outline-none ${
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
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            <span className="text-foreground text-sm">Creating your ticket…</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
