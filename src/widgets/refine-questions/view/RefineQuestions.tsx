import { Sparkles } from 'lucide-react'
import type { RefineAnswer, RefineOption, RefineQuestion } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'

// The interactive tool the refine agent's questions render into. Shared by
// single-note Refine (Detail) and Bulk Refine, so it lives in `widgets/`. Purely
// presentational and fully controlled: the parent owns the `answers` array and
// the submit/skip buttons; this only renders questions and reports changes.
//
// Each question offers one-click option chips (the agent's recommended one is
// marked) and, when allowed, a free-text field. Option and free text are mutually
// exclusive — picking one clears the other — so each question resolves to a single
// answer. Anything left blank falls back to the recommended option upstream
// (`resolveRefineAnswers`), which is the always-available skip.
export function RefineQuestions({
  questions,
  value,
  onChange,
}: {
  questions: readonly RefineQuestion[]
  value: readonly RefineAnswer[]
  onChange: (next: readonly RefineAnswer[]) => void
}) {
  const byId = new Map(value.map((a) => [a.questionId, a]))

  const setAnswer = (questionId: string, patch: Omit<RefineAnswer, 'questionId'>) => {
    const others = value.filter((a) => a.questionId !== questionId)
    onChange([...others, { questionId, ...patch }])
  }

  return (
    <ul className="flex min-h-0 flex-col gap-4">
      {questions.map((question) => {
        const answer = byId.get(question.id)
        return (
          <li
            key={question.id}
            data-testid={testIds.refineQuestion}
            className="border-border bg-surface-1 rounded-md border p-3.5"
          >
            <p className="text-foreground text-[13px] font-semibold">{question.title}</p>
            {question.body !== '' && (
              <p className="text-ink-subtle mt-1 text-xs leading-relaxed whitespace-pre-wrap">
                {question.body}
              </p>
            )}
            {question.options.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {question.options.map((option) => (
                  <OptionChip
                    key={option.id}
                    option={option}
                    selected={answer?.optionId === option.id && (answer?.text ?? '') === ''}
                    onClick={() => setAnswer(question.id, { optionId: option.id })}
                  />
                ))}
              </div>
            )}
            {question.allowFreeText && (
              <input
                type="text"
                data-testid={testIds.refineFreetext}
                value={answer?.text ?? ''}
                onChange={(e) => setAnswer(question.id, { text: e.target.value })}
                placeholder={
                  question.options.length > 0 ? 'Or type your own answer…' : 'Type your answer…'
                }
                aria-label={`Answer: ${question.title}`}
                className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-visible:ring-ring focus:border-border-strong mt-2.5 w-full rounded-md border p-2 text-[13px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function OptionChip({
  option,
  selected,
  onClick,
}: {
  option: RefineOption
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={option.recommended ? testIds.refineOptionRecommended : testIds.refineOption}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        selected
          ? 'text-foreground border-[#c084fc] bg-[#c084fc]/15'
          : 'border-border bg-surface-1 text-ink-subtle hover:bg-surface-2',
      )}
    >
      {option.recommended && (
        <Sparkles size={11} className={selected ? 'text-[#c084fc]' : 'text-ink-tertiary'} />
      )}
      <span>{option.label}</span>
      {option.recommended && (
        <span className="text-ink-tertiary text-[10px] font-normal tracking-wide uppercase">
          Recommended
        </span>
      )}
    </button>
  )
}
