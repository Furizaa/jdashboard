import { ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'
import { useGanttSkill } from '~/coordinator'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'

// Copies the whole SKILL — the document that teaches the REST API — with this
// server's base URL and this chart's id already substituted (ADR-0012 §12).
//
// The point of copying the document rather than an install command is that
// pasting it into an agent and saying "add a PRD for tier migration" needs no
// further briefing: an installed copy would be an indirection that can silently
// diverge from the running server, and substituting the base URL and chart id by
// hand is the step that is easiest to get wrong.
//
// It is also the one control on this read-only surface that is *about* writing,
// which is why it sits in the chart's header next to Refresh: the plan is
// maintained by an agent, and this is where you hand the agent its brief.
//
// `chartId` is **optional**, and the chart list passes none. The SKILL is what
// teaches an agent to create a chart in the first place, so a copy control that
// existed only once you had a chart would be unreachable exactly when it is
// needed: you would need a chart to get the document that explains how to make
// one. Without an id the server substitutes its documented placeholder.
//
// `labelled` is for the list, where this is the only control on screen and an
// icon alone would be a mystery; in the chart header it sits in a row of icons
// that share its visual grammar, so there it stays an icon.

export function CopySkillButton({
  chartId,
  labelled = false,
}: {
  chartId?: string
  labelled?: boolean
}) {
  const { readSkill, isPending } = useGanttSkill()

  async function copy() {
    // Two failures with two messages: the server could not read the document, or
    // the browser refused the clipboard. Telling them apart is the difference
    // between "try again" and "copy it from /api/gantt/skill yourself".
    let skill: string
    try {
      skill = (await readSkill(chartId)).skill
    } catch {
      toast.error("Couldn't read the Gantt SKILL from the server")
      return
    }
    try {
      await navigator.clipboard.writeText(skill)
      toast.success('SKILL copied — paste it into an agent')
    } catch {
      toast.error("Couldn't copy the SKILL to the clipboard")
    }
  }

  const description =
    chartId === undefined
      ? 'Copy the agent SKILL for the Gantt API'
      : 'Copy the agent SKILL for this chart'

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={isPending}
      data-testid={testIds.ganttCopySkill}
      aria-label={description}
      title={description}
      className={cn(
        'border-border text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50',
        labelled ? 'gap-1.5 px-2.5 text-xs font-medium' : 'w-7',
      )}
    >
      <ClipboardCopy size={13} aria-hidden />
      {labelled && <span>Copy agent SKILL</span>}
    </button>
  )
}
