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
import type { ExplainDiffState } from '../presenter'
import type { ExplainPaneDisplay, ExplainReportDisplay } from '../view-model'
import { ExplainActivityLog } from './ExplainActivityLog'
import { ExplainEmpty } from './ExplainEmpty'
import { ExplainMoveRail } from './ExplainMoveRail'
import { ExplainNotebook } from './ExplainNotebook'

/**
 * Whatever the selected tab is showing: nothing, a run in progress, a report, a
 * failure, or an interruption. Matched exhaustively, so a new pane state is a
 * compile error until it has a rendering.
 */
export function ExplainReportPane({
  pane,
  onRerun,
  onSelectMove,
  diff,
  onRequestDiff,
}: {
  pane: ExplainPaneDisplay
  onRerun: (iid: number) => void
  /** Open a move from the rail. `null` is Overview. */
  onSelectMove: (moveId: string | null) => void
  diff: ExplainDiffState
  onRequestDiff: () => void
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
    .with({ kind: 'report' }, (report) => (
      <Report
        report={report}
        onRerun={onRerun}
        onSelectMove={onSelectMove}
        diff={diff}
        onRequestDiff={onRequestDiff}
      />
    ))
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

/**
 * A finished report: the merge-request header above, then the two-column body —
 * the move rail on the left, the selected page's notebook on the right
 * (ADR-0010 §3).
 *
 * The header and the stale-report warning stay **above** the split because both
 * are about the merge request, and the thing below is about one move. The rail
 * and the notebook scroll independently: a long overview must not scroll the
 * rail's twelfth move out of reach.
 */
function Report({
  report,
  onRerun,
  onSelectMove,
  diff,
  onRequestDiff,
}: {
  report: ExplainReportDisplay
  onRerun: (iid: number) => void
  onSelectMove: (moveId: string | null) => void
  diff: ExplainDiffState
  onRequestDiff: () => void
}) {
  return (
    <div data-testid={testIds.explainReport} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-6 pt-5 pb-3">
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
            <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
            <span>{report.freshness}</span>
          </p>
        )}
      </div>
      <div className="border-border flex min-h-0 flex-1 border-t">
        <ExplainMoveRail entries={report.rail} onSelect={onSelectMove} />
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-6">
            <ExplainNotebook
              page={report.page}
              diff={diff}
              reportHeadSha={report.headSha}
              onRequestDiff={onRequestDiff}
            />
          </div>
        </div>
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
