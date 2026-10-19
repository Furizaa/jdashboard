import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChartList, GanttChartView } from '~/contexts/gantt'
import { testIds } from '~/lib/testids'
import { AppChrome } from '../-app-chrome'

/**
 * The fourth surface: `AppChrome` composed with either the chart list or one
 * chart (ADR-0012 §2).
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
 */
export function GanttShell({ chart }: { chart: string | undefined }) {
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

  return (
    // The `overlay` slot is deliberately empty in this slice. It is ADR-0009's
    // chrome slot, and slice 96 fills it with `IssueDetailPanel` so clicking a
    // mirrored lane opens the real ticket reader over the chart — one prop, and
    // ⌘K keeps working above it because `AppChrome` already mounts the palette
    // after the overlay.
    <AppChrome variant="gantt">
      <div data-testid={testIds.ganttSurface} className="h-full min-h-0">
        {chart === undefined ? (
          <ChartList onSelect={navigate} />
        ) : (
          <GanttChartView chartId={chart} onBack={() => navigate(null)} />
        )}
      </div>
    </AppChrome>
  )
}
