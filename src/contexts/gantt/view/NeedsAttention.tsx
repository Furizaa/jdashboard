import { CircleAlert } from 'lucide-react'
import { testIds } from '~/lib/testids'
import type { GanttNeedsAttention } from '../view-model'

// The four things a chart is waiting on a human — or an agent — to fix, stated
// in **one line** (ADR-0012 §4): undated lanes, lanes in flight with no forecast
// end, lanes nobody placed, and tickets that left their epic.
//
// One line rather than four badges because one instruction to an agent fixes
// all of it: "date these, place those, and tell me what happened to GEO-150" is
// a single turn, and a count split across the chart is a count nobody adds up.

export function NeedsAttention({ needs }: { needs: GanttNeedsAttention }) {
  if (needs.total === 0) return null

  const parts = [
    needs.undated.length > 0 ? `${needs.undated.length} undated` : null,
    // Spelled out rather than "8 open-ended": the count that matters is what is
    // missing, and what is missing is an end nobody has forecast. Beside
    // "undated" it is also what tells the two apart — "nobody knows when this
    // starts" and "nobody has said when this finishes" ask for different work.
    needs.openEnded.length > 0 ? `${needs.openEnded.length} in flight, no forecast end` : null,
    needs.unplacedAtRoot.length > 0 ? `${needs.unplacedAtRoot.length} unplaced` : null,
    needs.orphaned.length > 0 ? `${needs.orphaned.length} orphaned` : null,
  ].filter((part): part is string => part !== null)

  return (
    <span
      data-testid={testIds.ganttNeedsAttention}
      data-total={needs.total}
      title={`Undated: ${names(needs.undated)}\nIn flight: ${names(needs.openEnded)}\nUnplaced: ${names(needs.unplacedAtRoot)}\nOrphaned: ${names(needs.orphaned)}`}
      className="text-ink-subtle inline-flex items-center gap-1.5 text-[11px]"
    >
      <CircleAlert size={12} className="text-amber-400" aria-hidden />
      <span>Needs attention: {parts.join(' · ')}</span>
    </span>
  )
}

function names(ids: readonly string[]): string {
  return ids.length === 0 ? 'none' : ids.join(', ')
}
