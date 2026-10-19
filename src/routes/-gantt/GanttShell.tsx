import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChartList, GanttChartView } from '~/contexts/gantt'
import { IssueDetailPanel } from '~/contexts/detail'
import { testIds } from '~/lib/testids'
import { AppChrome } from '../-app-chrome'

/**
 * The fourth surface: `AppChrome` composed with either the chart list or one
 * chart (ADR-0012 §2), and the ticket detail panel in the chrome's `overlay`.
 *
 * A fourth standalone shell, not a pathless layout route. ADR-0007 left that
 * upgrade open and ADR-0009 named a fourth surface as its trigger; §2 looked and
 * declined, because the chrome extraction already took the win a layout route
 * would deliver and what is left per-surface is *board state* — which `/explain`
 * and `/gantt` would then carry for boards they do not have. The trigger is
 * re-aimed rather than removed: it is now a surface needing chrome state another
 * surface also needs.
 *
 * Like `ExplainShell`, this passes **no** `board` to the chrome. A chart is
 * read-only (ADR-0012 §8), so there is nothing to create and nothing to filter.
 *
 * It does pass an `overlay`, which is the first time ADR-0009's slot is filled
 * outside `AppShell`. Clicking a mirrored lane opens the real ticket reader —
 * ADF, comments, relationships, transitions — over the chart, because that is
 * already the best ticket reader in the app and reimplementing a worse one
 * beside it would be the only alternative. ⌘K keeps working above it for free:
 * `AppChrome` mounts the palette host *after* the overlay, and that order is
 * the whole mechanism.
 */
export function GanttShell({
  chart,
  issue,
  node,
}: {
  chart: string | undefined
  issue: string | undefined
  node: string | undefined
}) {
  const navigateFn = useNavigate()
  // `/gantt` lists; `/gantt?chart=<id>` opens one — ADR-0007's rule again.
  // `replace` on deselect keeps the back button meaningful: leaving a chart
  // should not leave the chart one step back in history.
  const navigate = useCallback(
    (chartId: string | null) => {
      navigateFn({
        to: '/gantt',
        search: chartId === null ? {} : { chart: chartId },
        replace: chartId === null,
      })
    },
    [navigateFn],
  )

  // Clicking a jira lane deep-links the panel **chart-relatively**, exactly as a
  // card navigates board-relatively: the chart stays in the URL, so closing the
  // panel returns to the chart rather than to the list.
  const openIssue = useCallback(
    (issueKey: string) => {
      navigateFn({ to: '.', search: (prev) => ({ ...prev, issue: issueKey }) })
    },
    [navigateFn],
  )

  // `?node=` is consumed the moment the chart acts on it, exactly as `AppShell`
  // consumes `?ai=`. `replace` is what covers both halves of the rule: a refresh
  // cannot re-reveal a lane the reader has already been shown, and the back
  // button cannot land on the reveal either, because it was never pushed.
  const clearNode = useCallback(() => {
    navigateFn({
      to: '.',
      replace: true,
      search: (prev) => ({ ...prev, node: undefined }),
    })
  }, [navigateFn])

  return (
    <AppChrome
      variant="gantt"
      overlay={
        <IssueDetailPanel
          issueKey={issue ?? null}
          // The chart has no notes affordance and no AI hand-off of its own: both
          // are board-side entry points into the note editor, and a lane is not a
          // card. The panel's own header toggle still opens Notes from here.
          notesOpen={false}
          aiModal={null}
          onAiModalConsumed={noop}
        />
      }
    >
      <div data-testid={testIds.ganttSurface} className="h-full min-h-0">
        {chart === undefined ? (
          <ChartList onSelect={navigate} />
        ) : (
          <GanttChartView
            chartId={chart}
            onBack={() => navigate(null)}
            revealNodeId={node}
            onNodeConsumed={clearNode}
            onOpenIssue={openIssue}
          />
        )}
      </div>
    </AppChrome>
  )
}

/**
 * `?ai=` never reaches this surface — nothing here writes it — so there is
 * nothing to consume. Declared once rather than inline so the panel's props keep
 * a stable identity across renders.
 */
const noop = () => {}
