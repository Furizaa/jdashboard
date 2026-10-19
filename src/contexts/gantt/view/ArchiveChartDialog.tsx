import { useState } from 'react'
import { Archive } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/design-system'
import { useArchiveGanttChart } from '~/coordinator'
import { testIds } from '~/lib/testids'

// The one way a chart's life ends, and the only control on this surface that
// changes what is on disk rather than what is on screen.
//
// ADR-0012 §8 splits the question in two: single-writer is a rule about chart
// *content*, where the agent writes and the UI reads; chart *lifecycle* is a
// different question, and the irreversible verb over a system of record belongs
// with the person rather than with a process acting on paraphrased
// instructions. So there is **no `DELETE /charts/:chartId`** for an agent to
// reach — its absence is asserted by a test — and the human's half of that
// bargain is this: a confirmation that names the chart before anything moves.
//
// It is an archive and not a delete. The folder, its bodies and its changelog
// move to `gantt/.archive/`, and an entry already there is never overwritten.
// The dialog says so, because "archive" is only reassuring if the reader
// believes it.
//
// Self-contained — trigger plus dialog plus mutation — in the shape
// `CopySkillButton` and `ChangelogPopover` establish for this header.

export function ArchiveChartDialog({
  chartId,
  title,
  onArchived,
}: {
  chartId: string
  title: string
  /** Where to go once the chart is gone. The header hands it its own Back. */
  onArchived: () => void
}) {
  const [open, setOpen] = useState(false)
  const { archive, isPending } = useArchiveGanttChart()

  async function confirm() {
    let result
    try {
      result = await archive(chartId)
    } catch {
      toast.error("Couldn't archive this chart")
      return
    }
    if (!result.ok) {
      // The one envelope failure left is the chart not being on disk, which is
      // a stale screen rather than a defect — so it reads as one.
      toast.error('That chart is no longer there')
      setOpen(false)
      onArchived()
      return
    }
    setOpen(false)
    toast.success(`Archived “${title}”`)
    // Navigate **after** the mutation resolves, so the chart list is invalidated
    // before it is rendered and never shows a row for a folder that has moved.
    onArchived()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testIds.ganttArchive}
        aria-label="Archive this chart"
        title="Archive this chart"
        className="border-border text-ink-subtle hover:text-destructive hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Archive size={13} aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent data-testid={testIds.ganttArchiveDialog} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive this chart?</DialogTitle>
            {/* Naming the chart is the point of the confirmation: it is the one
                fact that tells you whether you are archiving the one you meant. */}
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <p className="text-ink-subtle px-1 text-xs leading-relaxed">
            The chart moves to <span className="font-mono">~/.clashboard/gantt/.archive/</span> with
            its documents and its changelog. Nothing is erased, and it leaves this list. Putting it
            back means moving the folder yourself.
          </p>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-8 items-center rounded-md border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={isPending}
              data-testid={testIds.ganttArchiveConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-ring inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            >
              Archive chart
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
