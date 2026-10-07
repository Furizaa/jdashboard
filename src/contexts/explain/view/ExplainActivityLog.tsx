import { Brain, FileText, Globe, ListTree, Play, Search, Terminal, Wrench } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ExplainActivityKind, ExplainActivityLine } from '~/kernel'
import { testIds } from '~/lib/testids'

/**
 * What the agent is doing, live. A multi-minute wait is not a black box — the
 * worst property a ten-minute wait can have (ADR-0009 §4) — so every file it
 * reads, every history it walks, and every conclusion it reaches shows up here.
 *
 * The lines are the registry's translated `ExplainActivity`, never raw
 * stream-json: the translation happens once, server-side.
 */
export function ExplainActivityLog({
  activity,
  preparing,
}: {
  activity: readonly ExplainActivityLine[]
  /** Before the first event: the worktree is still being checked out. */
  preparing: boolean
}) {
  return (
    <div
      data-testid={testIds.explainActivityLog}
      aria-live="polite"
      aria-label="Review progress"
      className="border-border bg-surface-1 flex max-h-full min-h-0 flex-col overflow-y-auto rounded-md border font-mono text-[11px]"
    >
      {preparing && activity.length === 0 && (
        <p className="text-ink-subtle px-3 py-2">Checking the merge request out…</p>
      )}
      {activity.map((line) => (
        <p
          key={line.seq}
          data-testid={testIds.explainActivityLine}
          data-kind={line.kind}
          className="border-border/50 flex items-start gap-2 border-b px-3 py-1.5 last:border-b-0"
        >
          <span className="mt-px shrink-0">
            <KindIcon kind={line.kind} />
          </span>
          <span className="text-ink-subtle shrink-0 tabular-nums">{verbFor(line.kind)}</span>
          <span className="text-foreground/85 min-w-0 break-all">{line.text}</span>
        </p>
      ))}
    </div>
  )
}

function verbFor(kind: ExplainActivityKind): string {
  return match(kind)
    .with('start', () => '')
    .with('read', () => 'read')
    .with('search', () => 'grep')
    .with('list', () => 'glob')
    .with('shell', () => '$')
    .with('web', () => 'web')
    .with('thought', () => '')
    .with('tool', () => 'tool')
    .exhaustive()
}

function KindIcon({ kind }: { kind: ExplainActivityKind }) {
  const className = 'text-ink-tertiary'
  return match(kind)
    .with('start', () => <Play size={10} className={className} aria-hidden />)
    .with('read', () => <FileText size={10} className={className} aria-hidden />)
    .with('search', () => <Search size={10} className={className} aria-hidden />)
    .with('list', () => <ListTree size={10} className={className} aria-hidden />)
    .with('shell', () => <Terminal size={10} className={className} aria-hidden />)
    .with('web', () => <Globe size={10} className={className} aria-hidden />)
    .with('thought', () => <Brain size={10} className="text-blue-400/70" aria-hidden />)
    .with('tool', () => <Wrench size={10} className={className} aria-hidden />)
    .exhaustive()
}
