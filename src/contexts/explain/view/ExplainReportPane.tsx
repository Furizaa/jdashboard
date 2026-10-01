import {
  AlertTriangle,
  ExternalLink,
  GitCommitHorizontal,
  Loader2,
  RotateCw,
  Unplug,
} from 'lucide-react'
import { match } from 'ts-pattern'
import { testIds } from '~/lib/testids'
import { shortSha } from '../domain'
import type { ExplainPaneDisplay, ExplainReportDisplay } from '../view-model'
import { ExplainActivityLog } from './ExplainActivityLog'
import { ExplainEmpty } from './ExplainEmpty'
import { renderBlock } from './blocks'

/**
 * Whatever the selected tab is showing: nothing, a run in progress, a report, a
 * failure, or an interruption. Matched exhaustively, so a new pane state is a
 * compile error until it has a rendering.
 */
export function ExplainReportPane({
  pane,
  onRerun,
}: {
  pane: ExplainPaneDisplay
  onRerun: (iid: number) => void
}) {
  return match(pane)
    .with({ kind: 'loading' }, () => <div className="h-full" />)
    .with({ kind: 'no-tabs' }, () => <ExplainEmpty openCount={0} />)
    .with({ kind: 'none-selected' }, ({ count }) => <ExplainEmpty openCount={count} />)
    .with({ kind: 'starting' }, (starting) => (
      // The seconds between the click and the run. Without this the hand-off
      // lands on "No reviews open", which reads as the feature not working.
      <div
        data-testid={testIds.explainStarting}
        className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
      >
        <Loader2 size={22} className="text-ink-tertiary animate-spin" aria-hidden />
        <p className="text-foreground text-sm font-medium">Starting the review</p>
        <p className="text-ink-subtle max-w-sm text-xs leading-relaxed">
          {starting.title === null ? `!${starting.iid}` : `!${starting.iid} — ${starting.title}`} —
          reading the merge request and its ticket. The agent takes a few minutes once it begins.
        </p>
      </div>
    ))
    .with({ kind: 'working' }, (working) => (
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <PaneHeader
          title={working.title}
          iid={working.iid}
          webUrl={working.webUrl}
          subtitle={
            working.phase === 'preparing'
              ? 'Checking out the merge request…'
              : 'Reviewing — this takes a few minutes.'
          }
        />
        <ExplainActivityLog activity={working.activity} preparing={working.phase === 'preparing'} />
      </div>
    ))
    .with({ kind: 'report' }, (report) => <Report report={report} onRerun={onRerun} />)
    .with({ kind: 'failed' }, (failed) => (
      <div
        data-testid={testIds.explainFailed}
        className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
      >
        <AlertTriangle size={24} className="text-destructive" aria-hidden />
        <p className="text-foreground text-sm font-medium">The review failed</p>
        <p className="text-ink-subtle max-w-lg text-xs leading-relaxed">{failed.message}</p>
        <RerunButton iid={failed.iid} onRerun={onRerun} label="Try again" />
      </div>
    ))
    .with({ kind: 'interrupted' }, (interrupted) => (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <Unplug size={24} className="text-amber-400" aria-hidden />
        <p className="text-foreground text-sm font-medium">Interrupted</p>
        <p className="text-ink-subtle max-w-lg text-xs leading-relaxed">
          This review stopped before it reached a verdict — the server restarted under it, or it was
          superseded. Nothing was lost but the run.
        </p>
        <RerunButton iid={interrupted.iid} onRerun={onRerun} label="Re-run" />
      </div>
    ))
    .exhaustive()
}

function Report({
  report,
  onRerun,
}: {
  report: ExplainReportDisplay
  onRerun: (iid: number) => void
}) {
  return (
    <div data-testid={testIds.explainReport} className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <PaneHeader
          title={report.title}
          iid={report.iid}
          webUrl={report.webUrl}
          subtitle={null}
          commit={report.headSha}
          action={<RerunButton iid={report.iid} onRerun={onRerun} label="Re-run" />}
        />
        {report.freshness !== null && (
          <p
            data-testid={testIds.explainStaleWarning}
            className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300"
          >
            <AlertTriangle size={13} className="mt-[1px] shrink-0" aria-hidden />
            <span>{report.freshness}</span>
          </p>
        )}
        {report.blocks.map((block, index) => (
          // The index is the key because a report's block list is immutable once
          // persisted — blocks are never inserted, removed, or reordered, so the
          // position is a stable identity.
          // oxlint-disable-next-line no-array-index-key -- see comment above
          <div key={index}>{renderBlock(block)}</div>
        ))}
      </div>
    </div>
  )
}

function PaneHeader({
  title,
  iid,
  webUrl,
  subtitle,
  commit,
  action,
}: {
  title: string
  iid: number
  webUrl: string
  subtitle: string | null
  commit?: string
  action?: React.ReactNode
}) {
  return (
    <header className="flex shrink-0 items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-foreground truncate text-sm font-semibold tracking-[-0.015em]">
          {title}
        </h1>
        <p className="text-ink-subtle mt-1 flex items-center gap-2 text-xs">
          <a
            href={webUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            !{iid}
            <ExternalLink size={10} aria-hidden />
          </a>
          {commit !== undefined && commit !== '' && (
            <>
              <span className="bg-border h-3 w-px" aria-hidden />
              <span className="inline-flex items-center gap-1 font-mono">
                <GitCommitHorizontal size={11} aria-hidden />
                {shortSha(commit)}
              </span>
            </>
          )}
          {subtitle !== null && (
            <>
              <span className="bg-border h-3 w-px" aria-hidden />
              <span>{subtitle}</span>
            </>
          )}
        </p>
      </div>
      {action}
    </header>
  )
}

function RerunButton({
  iid,
  onRerun,
  label,
}: {
  iid: number
  onRerun: (iid: number) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onRerun(iid)}
      data-testid={testIds.explainRerun}
      data-iid={iid}
      className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <RotateCw size={11} aria-hidden />
      <span>{label}</span>
    </button>
  )
}
