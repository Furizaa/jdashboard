import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CloseTabDialog, ExplainReportPane, ExplainTabs, useExplain } from '~/contexts/explain'
import { testIds } from '~/lib/testids'
import { AppChrome } from '../-app-chrome'

/**
 * The third surface: `AppChrome` composed with the Explain tab strip and report
 * pane (ADR-0009 §1).
 *
 * It passes **no** `board` to the chrome, which is the whole point of the
 * extraction — Explain is not a board, so the header's New / filter chip / Only
 * Workspace controls and the palette's board commands are absent rather than
 * inert.
 */
export function ExplainShell({ mr }: { mr: number | undefined }) {
  const navigateFn = useNavigate()
  // `/explain` lists; `/explain?mr=123` selects — ADR-0007's rule, applied to a
  // tab. `replace` on deselect keeps the back button meaningful: closing a tab
  // should not leave the closed tab one step back in history.
  const navigate = useCallback(
    (iid: number | null) => {
      navigateFn({
        to: '/explain',
        search: iid === null ? {} : { mr: iid },
        replace: iid === null,
      })
    },
    [navigateFn],
  )

  const explain = useExplain({ selected: mr ?? null, navigate })

  return (
    <AppChrome
      variant="explain"
      overlay={
        <CloseTabDialog
          closing={explain.display.closing}
          onDismiss={explain.dismissClose}
          onConfirm={explain.confirmClose}
        />
      }
    >
      <div data-testid={testIds.explainSurface} className="flex h-full min-h-0 flex-col">
        <ExplainTabs
          tabs={explain.display.tabs}
          onSelect={explain.select}
          onClose={explain.requestClose}
        />
        <div className="min-h-0 flex-1">
          <ExplainReportPane pane={explain.display.pane} onRerun={explain.run} />
        </div>
      </div>
    </AppChrome>
  )
}
