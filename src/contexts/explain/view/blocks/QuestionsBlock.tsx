import { MessagesSquare } from 'lucide-react'
import type { ExplainBlockOf } from '~/kernel'
import { BlockShell } from './BlockShell'

/**
 * The questions for the author, phrased so each can be pasted straight into the
 * MR thread — which is what makes a report something to act on rather than
 * something to have read.
 */
export function QuestionsBlock({ block }: { block: ExplainBlockOf<'questions'> }) {
  return (
    <BlockShell
      kind="questions"
      title="For the author"
      icon={<MessagesSquare size={12} className="text-ink-tertiary" aria-hidden />}
    >
      <ol className="flex flex-col gap-2.5">
        {block.questions.map((question) => (
          <li key={question.question} className="flex gap-2.5">
            <span className="text-ink-tertiary mt-px shrink-0 font-mono text-[10px]">?</span>
            <span className="min-w-0">
              <span className="text-foreground block text-xs leading-relaxed">
                {question.question}
              </span>
              {question.why !== undefined && (
                <span className="text-ink-subtle mt-1 block text-xs leading-relaxed">
                  {question.why}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </BlockShell>
  )
}
