import { Boxes } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ExplainBlockOf, ExplainSystemChange } from '~/kernel'
import { cn } from '~/lib/cn'
import { BlockShell } from './BlockShell'

/**
 * The second block, always: which systems this change touches and what it does
 * to each. With the verdict, this is what tells an architect within seconds
 * whether the MR needs them.
 *
 * `contract-changed` is called out hardest, because a changed promise is the one
 * category of change whose cost lands on code that is not in the diff.
 */
export function SystemsBlock({ block }: { block: ExplainBlockOf<'systems'> }) {
  return (
    <BlockShell
      kind="systems"
      title="Systems touched"
      icon={<Boxes size={12} className="text-ink-tertiary" aria-hidden />}
    >
      <ul className="flex flex-col gap-2">
        {block.systems.map((system) => (
          <li key={system.name} className="flex items-baseline gap-2.5">
            <ChangeBadge change={system.change} />
            <span className="min-w-0">
              <span className="text-foreground font-mono text-xs font-medium">{system.name}</span>
              <span className="text-ink-subtle ml-2 text-xs leading-relaxed">{system.role}</span>
            </span>
          </li>
        ))}
      </ul>
    </BlockShell>
  )
}

function ChangeBadge({ change }: { change: ExplainSystemChange }) {
  const { label, className } = match(change)
    .with('added', () => ({ label: 'added', className: 'border-emerald-500/35 text-emerald-400' }))
    .with('changed', () => ({ label: 'changed', className: 'border-blue-500/35 text-blue-400' }))
    .with('contract-changed', () => ({
      label: 'contract',
      className: 'border-amber-500/45 bg-amber-500/10 text-amber-300',
    }))
    .with('removed', () => ({
      label: 'removed',
      className: 'border-destructive/40 text-destructive',
    }))
    .with('read-only', () => ({
      label: 'untouched',
      className: 'border-border text-ink-tertiary',
    }))
    .exhaustive()
  return (
    <span
      data-change={change}
      className={cn(
        'tracking-chip inline-flex h-4.5 w-18 shrink-0 items-center justify-center rounded border text-[10px] font-medium',
        className,
      )}
    >
      {label}
    </span>
  )
}
