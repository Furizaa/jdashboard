import { useEffect, useRef, useState, type RefObject } from 'react'
import { Check, Copy, Loader2, MessageCircleQuestion, Sparkles } from 'lucide-react'
import type { RefineAnswer } from '~/kernel'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'
import { testIds } from '~/lib/testids'
import { RefineQuestions } from '~/widgets/refine-questions'
import type { AskModalDisplay } from '../view-model'
import { NotesMarkdown } from './NotesMarkdown'

// The ask-a-question modal. The user types a question; a headless read-only agent
// answers. When the question is ambiguous the agent asks clarifying questions first
// (`grilling`), and the modal switches to the interactive question tool. The answer is
// shown read-only — the Ask session never writes — with Copy and "Refine to note"
// (hand the answer to the existing Refine flow) affordances. All lifecycle state is
// the presenter's; this is the dumb renderer. Cmd/Ctrl+Enter submits the input step.
export function AskModal({
  display,
  issueKey,
  onChangeQuestion,
  onSubmit,
  onClose,
  onChangeAnswers,
  onSubmitAnswers,
  onRefineToNote,
  onAskAgain,
}: {
  display: AskModalDisplay
  issueKey: string
  onChangeQuestion: (question: string) => void
  onSubmit: () => void
  onClose: () => void
  onChangeAnswers: (answers: readonly RefineAnswer[]) => void
  onSubmitAnswers: () => void
  onRefineToNote: (answer: string) => void
  onAskAgain: () => void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  if (!display.open) return null
  // Close is blocked only while the agent is actively working; grilling and the answer
  // view are freely closable.
  const busy = display.view === 'input' && display.submitting

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        data-testid={testIds.notesAskModal}
        showCloseButton={false}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
        className="flex max-h-[calc(100dvh-4rem)] w-[min(38rem,calc(100vw-2rem))] flex-col gap-0 p-6 sm:max-w-[38rem]"
      >
        <DialogTitle className="text-foreground mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
          <MessageCircleQuestion size={15} className="text-[#5eead4]" />
          Ask about {issueKey}
        </DialogTitle>
        {display.view === 'input' && (
          <InputStep
            display={display}
            inputRef={inputRef}
            onChangeQuestion={onChangeQuestion}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        )}
        {display.view === 'grilling' && (
          <GrillingStep
            display={display}
            onChangeAnswers={onChangeAnswers}
            onSubmitAnswers={onSubmitAnswers}
            onClose={onClose}
          />
        )}
        {display.view === 'answer' && (
          <AnswerStep
            display={display}
            onRefineToNote={onRefineToNote}
            onAskAgain={onAskAgain}
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
  onChangeQuestion,
  onSubmit,
  onClose,
}: {
  display: Extract<AskModalDisplay, { open: true; view: 'input' }>
  inputRef: RefObject<HTMLTextAreaElement | null>
  onChangeQuestion: (question: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  const { submitting, canSubmit, error, question } = display
  return (
    <>
      <p className="text-ink-subtle mb-4 text-xs">
        Ask a question about this ticket. An agent reads the note, description, comments, and linked
        tickets, and may follow links to answer. It never changes anything.
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
          data-testid={testIds.notesAskInput}
          value={question}
          onChange={(e) => onChangeQuestion(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
          }}
          disabled={submitting}
          spellCheck
          placeholder="e.g. What's blocking this, and who owns the fix?"
          aria-label="Question"
          className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-visible:ring-ring focus:border-border-strong h-32 w-full resize-none rounded-md border p-3 text-[13px] leading-relaxed transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        />
        {error !== null && <p className="text-destructive text-[11px]">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-tertiary text-[11px]">
            {submitting ? <ThinkingLabel /> : '⌘↵ to ask'}
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
              data-testid={testIds.notesAskSubmit}
              disabled={!canSubmit}
              className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <MessageCircleQuestion size={14} />
              )}
              <span>Ask</span>
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
  display: Extract<AskModalDisplay, { open: true; view: 'grilling' }>
  onChangeAnswers: (answers: readonly RefineAnswer[]) => void
  onSubmitAnswers: () => void
  onClose: () => void
}) {
  return (
    <>
      <p className="text-ink-subtle mb-4 text-xs">
        The question was ambiguous. Answer what you can — anything you skip uses the recommended
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
          data-testid={testIds.notesAskContinue}
          onClick={onSubmitAnswers}
          className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <MessageCircleQuestion size={14} />
          <span>Continue</span>
        </button>
      </div>
    </>
  )
}

function AnswerStep({
  display,
  onRefineToNote,
  onAskAgain,
  onClose,
}: {
  display: Extract<AskModalDisplay, { open: true; view: 'answer' }>
  onRefineToNote: (answer: string) => void
  onAskAgain: () => void
  onClose: () => void
}) {
  const { answer } = display
  return (
    <>
      <div
        data-testid={testIds.notesAskAnswer}
        className="border-border bg-surface-1 -mx-1 my-1 min-h-0 flex-1 overflow-y-auto rounded-md border p-4"
      >
        <NotesMarkdown content={answer} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid={testIds.notesAskAgain}
          onClick={onAskAgain}
          className="text-ink-subtle hover:text-foreground focus-visible:ring-ring rounded-md px-2 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          Ask another
        </button>
        <div className="flex items-center gap-2">
          <CopyButton text={answer} />
          <button
            type="button"
            data-testid={testIds.notesAskRefineToNote}
            onClick={() => onRefineToNote(answer)}
            className="refine-rainbow bg-surface-2 text-foreground hover:bg-surface-3 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <Sparkles size={14} className="text-[#c084fc]" />
            <span>Refine to note</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            Done
          </button>
        </div>
      </div>
    </>
  )
}

// Copy the answer to the clipboard, with a brief confirmation. Local view state only.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(id)
  }, [copied])
  return (
    <button
      type="button"
      data-testid={testIds.notesAskCopy}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => {},
        )
      }}
      className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

// An ask can take a while (it may fetch links); a live elapsed count keeps the wait
// legible. Mounted only while submitting, so it resets each run.
function ThinkingLabel() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <>The agent is looking into it… {seconds}s</>
}
