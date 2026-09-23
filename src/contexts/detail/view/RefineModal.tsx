import { useEffect, useRef, useState, type RefObject } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import type { RefineAnswer } from '~/kernel'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'
import { testIds } from '~/lib/testids'
import { RefineQuestions } from '~/widgets/refine-questions'
import type { RefineModalDisplay } from '../view-model'

// The paste-and-refine modal. The user pastes a transcript or a direct
// instruction; on submit a headless agent rewrites the note. When the transcript
// is ambiguous the agent asks clarifying questions first, and the modal switches
// to the interactive question tool (`grilling` view). All lifecycle state is the
// presenter's; this is the dumb renderer. Cmd/Ctrl+Enter submits the input step.
export function RefineModal({
  display,
  issueKey,
  onChangeText,
  onSubmit,
  onClose,
  onChangeAnswers,
  onSubmitAnswers,
}: {
  display: RefineModalDisplay
  issueKey: string
  onChangeText: (text: string) => void
  onSubmit: () => void
  onClose: () => void
  onChangeAnswers: (answers: readonly RefineAnswer[]) => void
  onSubmitAnswers: () => void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  if (!display.open) return null
  // Close is blocked only while the agent is actively working (input step,
  // submitting); the grilling step is freely closable.
  const busy = display.view === 'input' && display.submitting

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        data-testid={testIds.notesRefineModal}
        showCloseButton={false}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
        className="flex max-h-[calc(100dvh-4rem)] w-[min(34rem,calc(100vw-2rem))] flex-col gap-0 p-6 sm:max-w-[34rem]"
      >
        <DialogTitle className="text-foreground mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
          <Sparkles size={15} className="text-[#c084fc]" />
          Refine {issueKey} note
        </DialogTitle>
        {display.view === 'input' ? (
          <InputStep
            display={display}
            inputRef={inputRef}
            onChangeText={onChangeText}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        ) : (
          <GrillingStep
            display={display}
            onChangeAnswers={onChangeAnswers}
            onSubmitAnswers={onSubmitAnswers}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InputStep({
  display,
  inputRef,
  onChangeText,
  onSubmit,
  onClose,
}: {
  display: Extract<RefineModalDisplay, { open: true; view: 'input' }>
  inputRef: RefObject<HTMLTextAreaElement | null>
  onChangeText: (text: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  const { submitting, canSubmit, error, text } = display
  return (
    <>
      <p className="text-ink-subtle mb-4 text-xs">
        Paste a meeting transcript or an instruction. An agent folds it into the note, rewriting it
        to reflect the current state. It reads the ticket&apos;s description and comments for
        context but never changes them.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="flex flex-col gap-4"
      >
        <textarea
          ref={inputRef}
          data-testid={testIds.notesRefineInput}
          value={text}
          onChange={(e) => onChangeText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
          }}
          disabled={submitting}
          spellCheck
          placeholder="Paste transcript or type an instruction…"
          aria-label="Refine input"
          className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-visible:ring-ring focus:border-border-strong h-56 w-full resize-none rounded-md border p-3 font-mono text-[13px] leading-relaxed transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        />
        {error !== null && <p className="text-destructive text-[11px]">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-tertiary text-[11px]">
            {submitting ? <RefiningLabel /> : '⌘↵ to refine'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid={testIds.notesRefineSubmit}
              disabled={!canSubmit}
              className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>Refine</span>
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

function GrillingStep({
  display,
  onChangeAnswers,
  onSubmitAnswers,
  onClose,
}: {
  display: Extract<RefineModalDisplay, { open: true; view: 'grilling' }>
  onChangeAnswers: (answers: readonly RefineAnswer[]) => void
  onSubmitAnswers: () => void
  onClose: () => void
}) {
  return (
    <>
      <p className="text-ink-subtle mb-4 text-xs">
        The transcript was ambiguous. Answer what you can — anything you skip uses the recommended
        answer.
      </p>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <RefineQuestions
          questions={display.questions}
          value={display.answers}
          onChange={onChangeAnswers}
        />
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid={testIds.notesRefineContinue}
          onClick={onSubmitAnswers}
          className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Sparkles size={14} />
          <span>Continue</span>
        </button>
      </div>
    </>
  )
}

// A refine can take a couple of minutes; a live elapsed count keeps the wait
// legible instead of a static spinner. Mounted only while submitting, so it
// resets each run. Contained here — no view-model/presenter state.
function RefiningLabel() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <>The agent is rewriting your note… {seconds}s</>
}
