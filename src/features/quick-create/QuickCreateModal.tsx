import { useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { useCreateAction } from '~/dashboard'
import { QuickCreateForm } from './QuickCreateForm'

export function QuickCreateModal({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const summaryRef = useRef<HTMLInputElement>(null)
  const formResetRef = useRef<(() => void) | null>(null)

  const mutation = useCreateAction({
    closeModal: () => setOpen(false),
    resetForm: () => formResetRef.current?.(),
  })

  const isPending = mutation.isPending

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (isPending && !next) return
        setOpen(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (isPending) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (isPending) e.preventDefault()
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            summaryRef.current?.focus()
          }}
          className="border-border bg-card text-foreground fixed top-1/2 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-xl focus:outline-none"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-foreground text-sm font-semibold">
              Quick Create
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              disabled={isPending}
              className={`text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:ring-1 focus-visible:outline-none ${
                isPending ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <X size={14} />
            </Dialog.Close>
          </div>
          <div className={isPending ? 'hidden' : ''}>
            <QuickCreateForm
              summaryRef={summaryRef}
              closeModal={() => setOpen(false)}
              open={open}
              mutation={mutation}
              resetRef={formResetRef}
            />
          </div>
          {isPending && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              <span className="text-foreground text-sm">Creating your ticket…</span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
