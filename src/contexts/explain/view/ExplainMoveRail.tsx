import { CircleAlert, CircleDot, LayoutList, TriangleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ExplainSeverity, ExplainVerdict } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { ExplainRailEntryDisplay } from '../view-model'

/**
 * The move rail: the report's table of contents, and the only navigation inside
 * one review (ADR-0010).
 *
 * It is **rich on purpose**. A rail of bare titles would be a table of contents,
 * and the reader would have to open every page to find the one they want. So each
 * move shows what it is (title), why it was made (summary), what it touches
 * (system chips), how big it is (file count) and whether anything is wrong with
 * it (a severity dot and a count). The report schema requires `summary`,
 * `systems` and `paths` precisely so this can be true of every move rather than
 * of the ones the agent felt like describing.
 *
 * **Overview is pinned first and separated from the numbered moves**, because it
 * is a different kind of thing — it is about the merge request, not about one
 * move — and it carries the verdict chip, which is how the conclusion stays on
 * screen while the reader is three moves deep.
 *
 * The moves are listed in the agent's own order. Nothing here sorts them.
 */
export function ExplainMoveRail({
  entries,
  onSelect,
}: {
  entries: readonly ExplainRailEntryDisplay[]
  /** `null` selects Overview. The presenter turns it into `?move=`. */
  onSelect: (moveId: string | null) => void
}) {
  return (
    <nav
      data-testid={testIds.explainMoveRail}
      aria-label="The moves in this merge request"
      className="border-border bg-background/40 w-64 shrink-0 overflow-y-auto border-r"
    >
      <ol className="flex flex-col gap-0.5 p-2">
        {entries.map((entry) =>
          entry.kind === 'overview' ? (
            <OverviewEntry key="overview" entry={entry} onSelect={() => onSelect(null)} />
          ) : (
            <MoveEntry key={entry.id} entry={entry} onSelect={() => onSelect(entry.id)} />
          ),
        )}
      </ol>
    </nav>
  )
}

type OverviewEntry = Extract<ExplainRailEntryDisplay, { kind: 'overview' }>
type MoveEntry = Extract<ExplainRailEntryDisplay, { kind: 'move' }>

function OverviewEntry({ entry, onSelect }: { entry: OverviewEntry; onSelect: () => void }) {
  return (
    <li className="border-border/70 mb-1 border-b pb-1.5">
      <RailButton isSelected={entry.isSelected} kind="overview" onSelect={onSelect}>
        <span className="flex items-center gap-2">
          <LayoutList size={13} className="text-ink-tertiary shrink-0" aria-hidden />
          <span className="text-foreground text-[13px] font-medium">Overview</span>
          {entry.verdict !== null && <VerdictChip verdict={entry.verdict} />}
        </span>
        <span className="text-ink-tertiary mt-1 block pl-[21px] text-[11px]">
          {entry.moveCount === 1 ? '1 move' : `${entry.moveCount} moves`}
        </span>
      </RailButton>
    </li>
  )
}

function MoveEntry({ entry, onSelect }: { entry: MoveEntry; onSelect: () => void }) {
  return (
    <li>
      <RailButton
        isSelected={entry.isSelected}
        kind="move"
        id={entry.id}
        severity={entry.severity}
        onSelect={onSelect}
      >
        <span className="flex items-baseline gap-2">
          <span className="text-ink-tertiary w-3.5 shrink-0 text-right font-mono text-[11px] tabular-nums">
            {entry.position}
          </span>
          <span className="text-foreground min-w-0 flex-1 text-[13px] leading-snug font-medium">
            {entry.title}
          </span>
          {entry.severity !== null && (
            <SeverityDot severity={entry.severity} count={entry.findingCount} />
          )}
        </span>
        <span className="mt-1 block pl-[22px]">
          <span className="text-ink-subtle line-clamp-2 text-[11px] leading-relaxed">
            {entry.summary}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {entry.systems.map((system) => (
              <span
                key={system}
                className="border-border/80 text-ink-tertiary rounded border px-1 py-[1px] font-mono text-[10px]"
              >
                {system}
              </span>
            ))}
            <span className="text-ink-tertiary text-[10px]">
              {entry.fileCount === 1 ? '1 file' : `${entry.fileCount} files`}
            </span>
          </span>
        </span>
      </RailButton>
    </li>
  )
}

/** The shared frame: the selected-state treatment, and the test hooks. */
function RailButton({
  isSelected,
  kind,
  id,
  severity,
  onSelect,
  children,
}: {
  isSelected: boolean
  kind: 'overview' | 'move'
  id?: string
  severity?: ExplainSeverity | null
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? 'true' : undefined}
      data-testid={testIds.explainRailEntry}
      data-kind={kind}
      data-move={id}
      data-severity={severity ?? undefined}
      data-selected={isSelected}
      className={cn(
        'focus-visible:ring-ring w-full rounded-md px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
        isSelected ? 'bg-surface-2' : 'hover:bg-surface-1',
      )}
    >
      {children}
    </button>
  )
}

/** The verdict, in three characters of colour. The same vocabulary as the block. */
function VerdictChip({ verdict }: { verdict: ExplainVerdict }) {
  const tone = match(verdict)
    .with('sound', () => 'border-emerald-500/40 text-emerald-400')
    .with('discuss', () => 'border-amber-500/40 text-amber-400')
    .with('blocked', () => 'border-destructive/50 text-destructive')
    .exhaustive()
  return (
    <span
      className={cn(
        'ml-auto rounded border px-1.5 py-[1px] text-[10px] font-semibold tracking-[0.04em] uppercase',
        tone,
      )}
    >
      {verdict}
    </span>
  )
}

/**
 * The worst finding in the move, with how many there are. A move with no
 * findings gets no dot at all rather than a reassuring green one — the rail
 * should not claim a clean bill of health the report never gave.
 */
function SeverityDot({ severity, count }: { severity: ExplainSeverity; count: number }) {
  const style = match(severity)
    .with('high', () => ({ tone: 'text-destructive', glyph: <CircleAlert size={11} /> }))
    .with('medium', () => ({ tone: 'text-amber-400', glyph: <TriangleAlert size={11} /> }))
    .with('low', () => ({ tone: 'text-ink-subtle', glyph: <CircleDot size={11} /> }))
    .exhaustive()
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.5 text-[10px]', style.tone)}
      title={`${count} ${count === 1 ? 'finding' : 'findings'}, worst: ${severity}`}
    >
      <span aria-hidden>{style.glyph}</span>
      {count > 1 && <span className="tabular-nums">{count}</span>}
    </span>
  )
}
