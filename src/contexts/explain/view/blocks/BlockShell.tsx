import type { ReactNode } from 'react'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'

/**
 * The frame every block shares: a titled card. Blocks differ in what they say,
 * not in how they sit on the page, so the chrome lives in one place and each
 * renderer is only its own content.
 */
export function BlockShell({
  kind,
  title,
  icon,
  tone = 'plain',
  action,
  children,
}: {
  /** `data-kind` on the block, so a test can address one without a per-block id. */
  kind: string
  title?: string | undefined
  icon?: ReactNode
  tone?: 'plain' | 'alert' | 'caution' | 'calm'
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      data-testid={testIds.explainBlock}
      data-kind={kind}
      className={cn(
        'rounded-md border',
        tone === 'plain' && 'border-border bg-surface-1',
        tone === 'alert' && 'border-destructive/35 bg-destructive/5',
        tone === 'caution' && 'border-amber-500/30 bg-amber-500/5',
        tone === 'calm' && 'border-border bg-surface-1/60',
      )}
    >
      {(title !== undefined || action !== undefined) && (
        <header className="border-border/70 flex items-center gap-2 border-b px-3 py-2">
          {icon}
          {title !== undefined && (
            <h2 className="text-ink-subtle text-[11px] font-semibold tracking-[0.04em] uppercase">
              {title}
            </h2>
          )}
          {action !== undefined && <span className="ml-auto">{action}</span>}
        </header>
      )}
      <div className="px-3 py-2.5">{children}</div>
    </section>
  )
}
