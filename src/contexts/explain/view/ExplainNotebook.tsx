import { match } from 'ts-pattern'
import { CircleAlert, CircleDot, TriangleAlert } from 'lucide-react'
import type { ExplainBlock, ExplainSeverity } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { ExplainDiffState } from '../presenter'
import type { ExplainPageDisplay } from '../view-model'
import { MoveWholeDiff } from './MoveWholeDiff'
import { renderBlock } from './blocks'

/**
 * One page of the report, rendered the way a notebook renders a page: a header
 * saying what this is, then **cells** — prose, diffs, diagrams, findings — in the
 * order that explains it (ADR-0010).
 *
 * Two pages, matched exhaustively. `overview` is the merge request: the verdict,
 * the systems table, the blast radius, the questions, the unverified list.
 * `move` is one logical change, and it is the one that carries the move header
 * and the whole-diff expander.
 *
 * The cells themselves are the unchanged block renderers. That is the point of
 * keeping blocks as the leaf vocabulary: chaptering the report changed *where* a
 * list of blocks appears and nothing about how one is drawn.
 */
export function ExplainNotebook({
  page,
  diff,
  reportHeadSha,
  onRequestDiff,
}: {
  page: ExplainPageDisplay
  diff: ExplainDiffState
  reportHeadSha: string
  onRequestDiff: () => void
}) {
  return (
    <div
      data-testid={testIds.explainPage}
      data-kind={page.kind}
      data-move={page.kind === 'move' ? page.id : undefined}
      className="flex flex-col gap-4"
    >
      {page.kind === 'move' && <MoveHeader page={page} />}
      <Cells blocks={page.blocks} />
      {page.kind === 'move' && (
        <MoveWholeDiff
          // Keyed by the move, so expanding one move's diff and navigating to
          // another lands on a collapsed expander rather than inheriting the
          // previous page's open state.
          key={page.id}
          paths={page.paths}
          diff={diff}
          reportHeadSha={reportHeadSha}
          onRequest={onRequestDiff}
        />
      )}
    </div>
  )
}

function Cells({ blocks }: { blocks: readonly ExplainBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        // The index is the key because a page's cell list is immutable once
        // persisted — cells are never inserted, removed, or reordered, so the
        // position is a stable identity.
        // oxlint-disable-next-line no-array-index-key -- see comment above
        <div key={index}>{renderBlock(block)}</div>
      ))}
    </>
  )
}

type MovePage = Extract<ExplainPageDisplay, { kind: 'move' }>

/**
 * What this move is, before any of its cells. The rail already said all of it in
 * one line each; the page says it in full, because a reader who arrived from a
 * shared `?move=` link never saw the rail entry.
 */
function MoveHeader({ page }: { page: MovePage }) {
  return (
    <header data-testid={testIds.explainMoveHeader} className="flex flex-col gap-2">
      <p className="text-ink-tertiary flex items-center gap-2 text-[11px] tracking-[0.04em] uppercase">
        <span>
          Move {page.position} of {page.total}
        </span>
        {page.severity !== null && <SeverityLabel severity={page.severity} />}
      </p>
      <h2 className="text-foreground text-base leading-snug font-semibold tracking-[-0.015em]">
        {page.title}
      </h2>
      <p className="text-foreground/85 text-xs leading-relaxed">{page.summary}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {page.systems.map((system) => (
          <span
            key={system}
            className="border-border text-ink-subtle rounded border px-1.5 py-[1px] font-mono text-[10px]"
          >
            {system}
          </span>
        ))}
        <span className="bg-border h-3 w-px" aria-hidden />
        {page.paths.map((path) => (
          <span key={path} className="text-ink-tertiary font-mono text-[10px]">
            {path}
          </span>
        ))}
      </div>
    </header>
  )
}

function SeverityLabel({ severity }: { severity: ExplainSeverity }) {
  const style = match(severity)
    .with('high', () => ({ tone: 'text-destructive', glyph: <CircleAlert size={11} /> }))
    .with('medium', () => ({ tone: 'text-amber-400', glyph: <TriangleAlert size={11} /> }))
    .with('low', () => ({ tone: 'text-ink-subtle', glyph: <CircleDot size={11} /> }))
    .exhaustive()
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold', style.tone)}>
      <span aria-hidden>{style.glyph}</span>
      {severity}
    </span>
  )
}
