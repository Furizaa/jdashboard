import { ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'
import { useGanttSkill } from '~/coordinator'
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

export function CopySkillButton({ chartId }: { chartId: string }) {
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

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={isPending}
      data-testid={testIds.ganttCopySkill}
      aria-label="Copy the agent SKILL for this chart"
      title="Copy the agent SKILL for this chart"
      className="border-border text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
    >
      <ClipboardCopy size={13} aria-hidden />
    </button>
  )
}
