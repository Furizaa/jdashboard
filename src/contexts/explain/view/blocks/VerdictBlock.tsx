import { CircleAlert, CircleCheck, MessageCircleQuestionMark } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ExplainBlockOf, ExplainVerdict } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'

/**
 * The first block, always. "Does this need my attention?" answered in one word
 * and one line, because that is the question an architect opens a review with
 * and the one a diff viewer never answers.
 */
export function VerdictBlock({ block }: { block: ExplainBlockOf<'verdict'> }) {
  const style = styleFor(block.verdict)
  return (
    <section
      data-testid={testIds.explainBlock}
      data-kind="verdict"
      data-verdict={block.verdict}
      className={cn('flex items-start gap-3 rounded-md border px-4 py-3', style.frame)}
    >
      <span className={cn('mt-0.5 shrink-0', style.icon)}>{style.glyph}</span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className={cn('text-[10px] font-semibold tracking-[0.06em] uppercase', style.icon)}>
            {style.label}
          </span>
        </p>
        <p className="text-foreground mt-1 text-sm leading-snug font-medium">{block.headline}</p>
        {block.detail !== undefined && (
          <p className="text-ink-subtle mt-1.5 text-xs leading-relaxed">{block.detail}</p>
        )}
      </div>
    </section>
  )
}

function styleFor(verdict: ExplainVerdict) {
  return match(verdict)
    .with('sound', () => ({
      label: 'Sound',
      frame: 'border-emerald-500/30 bg-emerald-500/5',
      icon: 'text-emerald-400',
      glyph: <CircleCheck size={16} aria-hidden />,
    }))
    .with('discuss', () => ({
      label: 'Worth discussing',
      frame: 'border-amber-500/30 bg-amber-500/5',
      icon: 'text-amber-400',
      glyph: <MessageCircleQuestionMark size={16} aria-hidden />,
    }))
    .with('blocked', () => ({
      label: 'Should not land as-is',
      frame: 'border-destructive/40 bg-destructive/8',
      icon: 'text-destructive',
      glyph: <CircleAlert size={16} aria-hidden />,
    }))
    .exhaustive()
}
