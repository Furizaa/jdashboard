import { testIds } from '~/lib/testids'
import type { ExplainTabDisplay } from '../view-model'
import { ExplainTab } from './ExplainTab'

/**
 * The left-aligned sub-tab strip: one tab per merge request under review
 * (ADR-0009 §2). The strip is derived from the persisted open set, so it
 * survives a reload and a dev-server restart.
 */
export function ExplainTabs({
  tabs,
  onSelect,
  onClose,
}: {
  tabs: readonly ExplainTabDisplay[]
  onSelect: (iid: number) => void
  onClose: (iid: number) => void
}) {
  if (tabs.length === 0) return null
  return (
    <div
      data-testid={testIds.explainTabStrip}
      role="tablist"
      aria-label="Merge requests under review"
      className="border-border bg-background flex shrink-0 items-end gap-1 overflow-x-auto border-b px-4 pt-2"
    >
      {tabs.map((tab) => (
        <ExplainTab
          key={tab.iid}
          tab={tab}
          onSelect={() => onSelect(tab.iid)}
          onClose={() => onClose(tab.iid)}
        />
      ))}
    </div>
  )
}
