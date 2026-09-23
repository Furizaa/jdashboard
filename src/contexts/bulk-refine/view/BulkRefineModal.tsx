import { useRef, type ReactNode, type RefObject } from 'react'
import {
  AlertCircle,
  Check,
  CircleDashed,
  Loader2,
  MessageCircleQuestion,
  Wand2,
  X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/design-system'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import { RefineQuestions } from '~/widgets/refine-questions'
import type { ApplyItem, BulkRefineDisplay, SelectableMatch, TicketGrill } from '../view-model'
import type { BulkRefineApi } from '../presenter'

// The Bulk Refine wizard: one modal that walks paste → route → pick → apply →
// summary, switching on `display.step`. All lifecycle state is the presenter's;
// this is the dumb renderer.
export function BulkRefineModal({ bulk }: { bulk: BulkRefineApi }) {
  const { display, isBusy } = bulk
  const inputRef = useRef<HTMLTextAreaElement>(null)
  if (!display.open) return null

  return (
    <Dialog open onOpenChange={(next) => !next && !isBusy && bulk.close()}>
      <DialogContent
        data-testid={testIds.bulkRefineModal}
        showCloseButton={false}
        onPointerDownOutside={(e) => isBusy && e.preventDefault()}
        onEscapeKeyDown={(e) => isBusy && e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
        className="flex max-h-[calc(100dvh-4rem)] w-[min(40rem,calc(100vw-2rem))] flex-col gap-0 p-6 sm:max-w-[40rem]"
      >
        <DialogTitle className="text-foreground mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
          <Wand2 size={15} className="text-[#c084fc]" />
          Bulk Refine
        </DialogTitle>
        <DialogDescription className="text-ink-subtle mb-4 text-xs">
          Paste a meeting transcript. Each board or watchlist ticket the meeting discussed gets its
          note refined from what was said about it.
        </DialogDescription>

        {display.step === 'input' || display.step === 'route-error' ? (
          <InputStep bulk={bulk} display={display} inputRef={inputRef} />
        ) : display.step === 'routing' ? (
          <Centered>
            <Loader2 size={18} className="animate-spin text-[#c084fc]" />
            <span>Finding the tickets this meeting discussed…</span>
          </Centered>
        ) : display.step === 'no-matches' ? (
          <>
            <Centered>
              <span>No board or watchlist ticket was discussed in that transcript.</span>
            </Centered>
            <Footer>
              <PrimaryButton onClick={bulk.close}>Close</PrimaryButton>
            </Footer>
          </>
        ) : display.step === 'preview' ? (
          <PreviewStep bulk={bulk} display={display} />
        ) : display.step === 'gathering' ? (
          <GatheringStep display={display} />
        ) : display.step === 'questions' ? (
          <QuestionsStep bulk={bulk} display={display} />
        ) : (
          <ApplyStep bulk={bulk} display={display} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InputStep({
  bulk,
  display,
  inputRef,
}: {
  bulk: BulkRefineApi
  display: Extract<BulkRefineDisplay, { step: 'input' | 'route-error' }>
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <textarea
        ref={inputRef}
        data-testid={testIds.bulkRefineInput}
        value={display.transcript}
        onChange={(e) => bulk.setTranscript(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && display.canRoute) {
            e.preventDefault()
            bulk.route()
          }
        }}
        spellCheck
        placeholder="Paste the meeting transcript…"
        aria-label="Meeting transcript"
        className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-visible:ring-ring focus:border-border-strong h-64 w-full resize-none rounded-md border p-3 font-mono text-[13px] leading-relaxed transition-colors focus-visible:ring-2 focus-visible:outline-none"
      />
      {display.step === 'route-error' && (
        <p className="text-destructive text-[11px]">{display.message}</p>
      )}
      <Footer>
        <span className="text-ink-tertiary text-[11px]">⌘↵ to find tickets</span>
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={bulk.close}>Cancel</SecondaryButton>
          <PrimaryButton
            testId={testIds.bulkRefineRouteButton}
            onClick={bulk.route}
            disabled={!display.canRoute}
          >
            <Wand2 size={14} />
            <span>{display.step === 'route-error' ? 'Retry' : 'Find tickets'}</span>
          </PrimaryButton>
        </div>
      </Footer>
    </div>
  )
}

function PreviewStep({
  bulk,
  display,
}: {
  bulk: BulkRefineApi
  display: Extract<BulkRefineDisplay, { step: 'preview' }>
}) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <p className="text-ink-subtle text-xs">
        {display.matches.length} ticket{display.matches.length === 1 ? '' : 's'} discussed ·{' '}
        {display.selectedCount} selected
      </p>
      <ul className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1">
        {display.matches.map((match) => (
          <MatchRow key={match.key} match={match} onToggle={() => bulk.toggle(match.key)} />
        ))}
      </ul>
      <Footer>
        <SecondaryButton onClick={bulk.close}>Cancel</SecondaryButton>
        <PrimaryButton
          testId={testIds.bulkRefineApplyButton}
          onClick={bulk.apply}
          disabled={!display.canApply}
        >
          <Wand2 size={14} />
          <span>
            Refine {display.selectedCount} note{display.selectedCount === 1 ? '' : 's'}
          </span>
        </PrimaryButton>
      </Footer>
    </div>
  )
}

function MatchRow({ match, onToggle }: { match: SelectableMatch; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        data-testid={testIds.bulkRefineMatchRow}
        aria-pressed={match.selected}
        className={cn(
          'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
          match.selected
            ? 'border-[#c084fc]/40 bg-[#c084fc]/10'
            : 'border-border bg-surface-1 hover:bg-surface-2',
        )}
      >
        <span
          data-testid={testIds.bulkRefineMatchToggle}
          className={cn(
            'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
            match.selected
              ? 'border-[#c084fc] bg-[#c084fc] text-white'
              : 'border-border-strong bg-surface-1',
          )}
        >
          {match.selected && <Check size={12} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-foreground font-mono text-xs font-semibold">{match.key}</span>
            <span className="text-ink-subtle truncate text-xs">{match.summary}</span>
          </span>
          <span className="text-ink-tertiary mt-1 block text-[11px] leading-relaxed whitespace-pre-wrap">
            {match.brief}
          </span>
        </span>
      </button>
    </li>
  )
}

function GatheringStep({
  display,
}: {
  display: Extract<BulkRefineDisplay, { step: 'gathering' }>
}) {
  return (
    <div data-testid={testIds.bulkRefineGathering} className="flex min-h-0 flex-col gap-4">
      <p className="text-ink-subtle text-xs">
        Reading what was said about each ticket… {display.finishedCount} of {display.total} done
      </p>
      <ul className="-mx-1 flex min-h-0 flex-col gap-1.5 overflow-y-auto px-1">
        {display.items.map((item) => (
          <ProgressRow key={item.key} item={item} />
        ))}
      </ul>
    </div>
  )
}

function QuestionsStep({
  bulk,
  display,
}: {
  bulk: BulkRefineApi
  display: Extract<BulkRefineDisplay, { step: 'questions' }>
}) {
  const count = display.grills.length
  return (
    <div data-testid={testIds.bulkRefineQuestions} className="flex min-h-0 flex-col gap-4">
      <p className="text-ink-subtle text-xs">
        {count} ticket{count === 1 ? '' : 's'} need a clarification before refining
        {display.settledCount > 0 ? ` · ${display.settledCount} already refined` : ''}. Answer what
        you can — anything you skip uses the recommended answer.
      </p>
      <ul className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1">
        {display.grills.map((grill) => (
          <TicketQuestions
            key={grill.key}
            grill={grill}
            onChangeAnswers={(answers) => bulk.setAnswers(grill.key, answers)}
          />
        ))}
      </ul>
      <Footer>
        <SecondaryButton onClick={bulk.close}>Cancel</SecondaryButton>
        <PrimaryButton testId={testIds.bulkRefineQuestionsApply} onClick={bulk.submitAnswers}>
          <Wand2 size={14} />
          <span>
            Refine {count} note{count === 1 ? '' : 's'}
          </span>
        </PrimaryButton>
      </Footer>
    </div>
  )
}

function TicketQuestions({
  grill,
  onChangeAnswers,
}: {
  grill: TicketGrill
  onChangeAnswers: (answers: TicketGrill['answers']) => void
}) {
  return (
    <li>
      <div className="mb-2 flex items-baseline gap-2">
        <MessageCircleQuestion size={13} className="translate-y-0.5 text-[#c084fc]" />
        <span className="text-foreground font-mono text-xs font-semibold">{grill.key}</span>
        <span className="text-ink-subtle truncate text-xs">{grill.summary}</span>
      </div>
      <RefineQuestions
        questions={grill.questions}
        value={grill.answers}
        onChange={onChangeAnswers}
      />
    </li>
  )
}

function ApplyStep({
  bulk,
  display,
}: {
  bulk: BulkRefineApi
  display: Extract<BulkRefineDisplay, { step: 'applying' | 'done' }>
}) {
  const done = display.step === 'done'
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <p className="text-ink-subtle text-xs">
        {done
          ? `Refined ${display.okCount} note${display.okCount === 1 ? '' : 's'}` +
            (display.failCount > 0 ? ` · ${display.failCount} failed` : '')
          : `Refining notes… ${display.finishedCount} of ${display.total} done`}
      </p>
      <ul className="-mx-1 flex min-h-0 flex-col gap-1.5 overflow-y-auto px-1">
        {display.items.map((item) => (
          <ProgressRow key={item.key} item={item} />
        ))}
      </ul>
      {done && (
        <Footer>
          <PrimaryButton onClick={bulk.close}>Done</PrimaryButton>
        </Footer>
      )}
    </div>
  )
}

function ProgressRow({ item }: { item: ApplyItem }) {
  return (
    <li
      data-testid={testIds.bulkRefineProgressRow}
      data-status={item.status}
      className="border-border bg-surface-1 flex items-start gap-3 rounded-md border p-2.5"
    >
      <span className="mt-0.5 shrink-0">
        <StatusIcon status={item.status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-foreground font-mono text-xs font-semibold">{item.key}</span>
          <span className="text-ink-subtle truncate text-xs">{item.summary}</span>
        </span>
        {item.status === 'failed' && item.error !== undefined && (
          <span className="text-destructive mt-0.5 block text-[11px]">{item.error}</span>
        )}
      </span>
    </li>
  )
}

function StatusIcon({ status }: { status: ApplyItem['status'] }) {
  switch (status) {
    case 'pending':
      return <CircleDashed size={14} className="text-ink-tertiary" />
    case 'refining':
      return <Loader2 size={14} className="animate-spin text-[#c084fc]" />
    case 'awaiting':
      return <MessageCircleQuestion size={14} className="text-[#c084fc]" />
    case 'done':
      return <Check size={14} className="text-emerald-500" strokeWidth={2.5} />
    case 'failed':
      return <X size={14} className="text-destructive" strokeWidth={2.5} />
    default:
      return <AlertCircle size={14} className="text-ink-tertiary" />
  }
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="text-ink-subtle flex min-h-24 flex-col items-center justify-center gap-3 text-center text-xs">
      {children}
    </div>
  )
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex items-center justify-between gap-2">{children}</div>
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring ml-auto inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      {children}
    </button>
  )
}
