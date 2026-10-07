import { FileDiff } from 'lucide-react'
import type { ExplainBlockOf } from '~/kernel'
import { testIds } from '~/lib/testids'
import { BlockShell } from './BlockShell'
import { DiffHunk } from './DiffHunk'

/**
 * A diff cell: the hunk the agent chose, with a sentence over it saying what to
 * look at (ADR-0010 §6).
 *
 * Distinct from `finding.hunk`, which exists to back a claim. Most of what a
 * move does is not a problem, so a diff with no finding attached is the common
 * case — and it is the cell that makes a move page an explanation rather than a
 * verdict. The caption sits **above** the code, because it is the thing that
 * tells you how to read what follows.
 */
export function DiffBlock({ block }: { block: ExplainBlockOf<'diff'> }) {
  return (
    <BlockShell
      kind="diff"
      title="Diff"
      icon={<FileDiff size={12} className="text-ink-tertiary shrink-0" aria-hidden />}
    >
      {block.caption !== undefined && (
        <p
          data-testid={testIds.explainDiffCaption}
          className="text-foreground/85 mb-2 text-xs leading-relaxed"
        >
          {block.caption}
        </p>
      )}
      <DiffHunk path={block.path} diff={block.diff} language={block.language} />
    </BlockShell>
  )
}
