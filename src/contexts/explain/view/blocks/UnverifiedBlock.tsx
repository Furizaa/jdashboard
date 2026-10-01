import { ShieldQuestionMark } from 'lucide-react'
import type { ExplainBlockOf } from '~/kernel'
import { BlockShell } from './BlockShell'

/**
 * What the agent could not check, and why.
 *
 * This block is the honest half of a deliberate trade (ADR-0009 §6): the
 * worktree has no dependencies installed and nothing built, so the agent cannot
 * install, build, typecheck, or run tests. Rather than hide that, the schema
 * carries this block and the prompt requires it — so an unchecked assumption can
 * never be mistaken for a checked one.
 */
export function UnverifiedBlock({ block }: { block: ExplainBlockOf<'unverified'> }) {
  return (
    <BlockShell
      kind="unverified"
      title="Not verified"
      tone="caution"
      icon={<ShieldQuestionMark size={12} className="text-amber-400/80" aria-hidden />}
    >
      <ul className="flex flex-col gap-2">
        {block.items.map((item) => (
          <li key={item.claim} className="flex gap-2.5">
            <span className="text-ink-tertiary mt-[1px] shrink-0 font-mono text-[10px]">—</span>
            <span className="min-w-0">
              <span className="text-foreground block text-xs leading-relaxed">{item.claim}</span>
              <span className="text-ink-subtle mt-0.5 block text-xs leading-relaxed">
                {item.why}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </BlockShell>
  )
}
