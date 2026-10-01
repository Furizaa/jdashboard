import { CircleAlert, CircleDot, TriangleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ExplainBlockOf, ExplainSeverity } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import { DiffHunk } from './DiffHunk'

/**
 * One finding, at the altitude an architect reviews at. The schema is what keeps
 * it there: a finding cannot be expressed without the **system** it concerns and
 * **why it matters**, and there is no `nit` severity to pick (ADR-0009 §7). So
 * both of those are given the prominence the schema implies — the system beside
 * the title, the consequence as the first line of body text.
 */
export function FindingBlock({ block }: { block: ExplainBlockOf<'finding'> }) {
  const style = styleFor(block.severity)
  return (
    <section
      data-testid={testIds.explainBlock}
      data-kind="finding"
      data-severity={block.severity}
      data-system={block.system}
      className={cn('rounded-md border', style.frame)}
    >
      <header className="flex items-start gap-2.5 px-3 py-2.5">
        <span className={cn('mt-[2px] shrink-0', style.icon)}>{style.glyph}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cn('text-[10px] font-semibold tracking-[0.06em] uppercase', style.icon)}
            >
              {block.severity}
            </span>
            <span className="border-border text-ink-subtle rounded border px-1.5 py-[1px] font-mono text-[10px]">
              {block.system}
            </span>
            <span className="text-foreground text-[13px] leading-snug font-medium">
              {block.title}
            </span>
          </p>
          <p
            data-testid={testIds.explainFinding}
            className="text-foreground/85 mt-1.5 text-xs leading-relaxed"
          >
            {block.whyItMatters}
          </p>
          {block.detail !== undefined && (
            <p className="text-ink-subtle mt-1.5 text-xs leading-relaxed">{block.detail}</p>
          )}
        </div>
      </header>
      {block.hunk !== undefined && (
        <div className="px-3 pb-3">
          <DiffHunk path={block.hunk.path} diff={block.hunk.diff} language={block.hunk.language} />
        </div>
      )}
    </section>
  )
}

function styleFor(severity: ExplainSeverity) {
  return match(severity)
    .with('high', () => ({
      frame: 'border-destructive/40 bg-destructive/5',
      icon: 'text-destructive',
      glyph: <CircleAlert size={14} aria-hidden />,
    }))
    .with('medium', () => ({
      frame: 'border-amber-500/30 bg-amber-500/5',
      icon: 'text-amber-400',
      glyph: <TriangleAlert size={14} aria-hidden />,
    }))
    .with('low', () => ({
      frame: 'border-border bg-surface-1',
      icon: 'text-ink-subtle',
      glyph: <CircleDot size={14} aria-hidden />,
    }))
    .exhaustive()
}
