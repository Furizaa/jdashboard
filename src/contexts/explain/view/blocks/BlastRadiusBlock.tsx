import { Radar } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ExplainBlockOf } from '~/kernel'
import { cn } from '~/lib/cn'
import { BlockShell } from './BlockShell'

/**
 * What breaks, and who is downstream, if this change is wrong.
 *
 * This is the block that justifies the whole feature: it is the question a diff
 * viewer structurally cannot answer, because the answer is about code that is
 * not in the diff.
 */
export function BlastRadiusBlock({ block }: { block: ExplainBlockOf<'blast-radius'> }) {
  return (
    <BlockShell
      kind="blast-radius"
      title="Blast radius"
      icon={<Radar size={12} className="text-ink-tertiary" aria-hidden />}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-ink-tertiary text-[10px] tracking-[0.04em] uppercase">
              <th className="border-border/70 border-b px-2 py-1.5 text-left font-semibold">
                Surface
              </th>
              <th className="border-border/70 border-b px-2 py-1.5 text-left font-semibold">
                If it is wrong
              </th>
              <th className="border-border/70 border-b px-2 py-1.5 text-left font-semibold">
                Downstream
              </th>
              <th className="border-border/70 border-b px-2 py-1.5 text-left font-semibold">
                Likelihood
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.surface} className="border-border/40 border-b last:border-b-0">
                <td className="text-foreground px-2 py-2 align-top font-mono text-[11px]">
                  {row.surface}
                </td>
                <td className="text-foreground/85 px-2 py-2 align-top leading-relaxed">
                  {row.ifWrong}
                </td>
                <td className="px-2 py-2 align-top">
                  {row.downstream.length === 0 ? (
                    <span className="text-ink-tertiary">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {row.downstream.map((name) => (
                        <span
                          key={name}
                          className="border-border text-ink-subtle rounded border px-1.5 py-px font-mono text-[10px]"
                        >
                          {name}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 align-top">
                  <Likelihood value={row.likelihood} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BlockShell>
  )
}

function Likelihood({ value }: { value: 'high' | 'medium' | 'low' }) {
  const className = match(value)
    .with('high', () => 'border-destructive/40 text-destructive')
    .with('medium', () => 'border-amber-500/40 text-amber-400')
    .with('low', () => 'border-border text-ink-subtle')
    .exhaustive()
  return (
    <span
      data-likelihood={value}
      className={cn('inline-flex rounded border px-1.5 py-px text-[10px] font-medium', className)}
    >
      {value}
    </span>
  )
}
