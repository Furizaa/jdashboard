import { useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
  Loader2,
} from 'lucide-react'
import { match } from 'ts-pattern'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import { moveDiffFor, shortSha } from '../domain'
import type { ExplainDiffState } from '../presenter'
import { DiffHunk } from './blocks/DiffHunk'

/**
 * "Show the whole diff" — the curation escape hatch (ADR-0010 §6).
 *
 * A move page's diff cells are the hunks the agent chose. That is the right
 * default and it is also a judgement, so the reader has to be able to check what
 * it left out; otherwise the surface asks for trust it has not earned. This
 * fetches the merge request's real diff and shows the files the move's `paths`
 * name.
 *
 * Two honesty details are load-bearing. The diff is read **live**, so it names
 * the commit it is showing — which may be later than the one the report
 * describes. And a path the merge request no longer contains is **named as
 * missing** rather than quietly dropped: a move whose files have moved on is
 * itself a staleness signal, and silence would hide it.
 */
export function MoveWholeDiff({
  paths,
  diff,
  reportHeadSha,
  onRequest,
}: {
  /** The move's files, in the order the move names them. */
  paths: readonly string[]
  diff: ExplainDiffState
  /** The commit the report describes, to compare against what GitLab returns. */
  reportHeadSha: string
  /** Kicks off the fetch. Idempotent — the query is cached per merge request. */
  onRequest: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = () => {
    if (!isOpen) onRequest()
    setIsOpen((open) => !open)
  }

  return (
    <section className="border-border bg-surface-1/60 rounded-md border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        data-testid={testIds.explainWholeDiffToggle}
        className="text-ink-subtle hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {isOpen ? (
          <ChevronDown size={13} className="shrink-0" aria-hidden />
        ) : (
          <ChevronRight size={13} className="shrink-0" aria-hidden />
        )}
        <span>
          {isOpen ? 'Hide the whole diff' : 'Show the whole diff'}
          <span className="text-ink-tertiary">
            {' '}
            ({paths.length === 1 ? '1 file' : `${paths.length} files`})
          </span>
        </span>
      </button>
      {isOpen && (
        <div data-testid={testIds.explainWholeDiff} className="px-3 pt-0 pb-3">
          <Body paths={paths} diff={diff} reportHeadSha={reportHeadSha} />
        </div>
      )}
    </section>
  )
}

function Body({
  paths,
  diff,
  reportHeadSha,
}: {
  paths: readonly string[]
  diff: ExplainDiffState
  reportHeadSha: string
}) {
  return (
    match(diff)
      // `idle` is one frame: the toggle requests the fetch as it opens. It reads as
      // loading rather than as empty, because empty would be a lie about a fetch
      // that is about to happen.
      .with({ status: 'idle' }, { status: 'loading' }, () => (
        <p className="text-ink-tertiary flex items-center gap-2 py-2 text-xs">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          Reading the merge request’s diff…
        </p>
      ))
      .with({ status: 'failed' }, (failed) => (
        <p className="text-ink-subtle flex items-start gap-2 py-2 text-xs leading-relaxed">
          <AlertTriangle size={13} className="text-destructive mt-px shrink-0" aria-hidden />
          {failed.message}
        </p>
      ))
      .with({ status: 'ready' }, (ready) => {
        const { files, missing } = moveDiffFor(paths, ready.files)
        return (
          <div className="flex flex-col gap-2">
            <p className="text-ink-tertiary flex flex-wrap items-center gap-1.5 text-[11px]">
              <GitCommitHorizontal size={11} aria-hidden />
              <span className="font-mono">{shortSha(ready.headSha)}</span>
              <span>
                {ready.headSha === reportHeadSha
                  ? '— the commit this report describes'
                  : '— the merge request’s head now, which is past the commit this report describes'}
              </span>
            </p>
            {files.map((file) => (
              <div key={file.path} data-testid={testIds.explainWholeDiffFile} data-path={file.path}>
                {file.diff === '' ? (
                  <p className="border-border bg-surface-2 text-ink-tertiary rounded-md border px-2.5 py-1.5 font-mono text-[11px]">
                    {file.path} — {file.status}, no diff to show (binary, or too large)
                  </p>
                ) : (
                  <>
                    {file.previousPath !== null && (
                      <p className="text-ink-tertiary mb-0.5 font-mono text-[10px]">
                        renamed from {file.previousPath}
                      </p>
                    )}
                    <DiffHunk
                      path={file.path}
                      diff={file.diff}
                      language={file.language ?? undefined}
                    />
                  </>
                )}
              </div>
            ))}
            {missing.length > 0 && (
              <p
                className={cn(
                  'rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5',
                  'text-[11px] leading-relaxed text-amber-300',
                )}
              >
                {missing.length === 1 ? 'This file is' : 'These files are'} named by the move but
                not in the merge request’s diff any more:{' '}
                <span className="font-mono">{missing.join(', ')}</span>. The report describes an
                earlier commit.
              </p>
            )}
            {files.length === 0 && missing.length === 0 && (
              <p className="text-ink-tertiary py-1 text-xs">
                The merge request’s diff is empty — nothing to show.
              </p>
            )}
          </div>
        )
      })
      .exhaustive()
  )
}
