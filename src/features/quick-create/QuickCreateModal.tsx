import { useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { QuickCreateForm } from './QuickCreateForm'

export function QuickCreateModal({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const summaryRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          onPointerDownOutside={(e) => e.preventDefault()}
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
              className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:ring-1 focus-visible:outline-none"
            >
              <X size={14} />
            </Dialog.Close>
          </div>
          <QuickCreateForm
            summaryRef={summaryRef}
            closeModal={() => setOpen(false)}
            open={open}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
