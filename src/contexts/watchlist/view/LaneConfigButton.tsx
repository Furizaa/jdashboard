import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useRegisterCommand, useTagDefinitions } from '~/coordinator'
import type { WatchlistLaneConfig } from '~/kernel'
import { testIds } from '~/lib/testids'
import { useSetWatchlistLanes, useWatchlistLanes } from '../presenter'
import { LaneConfigModal } from './LaneConfigModal'

// A fresh lane id. Independent of the lane's tags, so a lane keeps its collapsed
// state (keyed by id) as its tag set is edited.
function newLaneId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `lane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Header control for the Watchlist Board: opens the lane-config modal. The draft
// (ordered lanes of tag ids) is seeded from the persisted config at open time —
// avoiding a syncing effect — and persisted on Save.
export function LaneConfigButton() {
  const definitions = useTagDefinitions()
  const lanesQuery = useWatchlistLanes()
  const { setLanes, isPending } = useSetWatchlistLanes()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<readonly WatchlistLaneConfig[]>([])

  const openModal = () => {
    setDraft(lanesQuery.data?.lanes ?? [])
    setOpen(true)
  }

  // Registered only while this button is mounted — it exists on `/watchlist`
  // alone, so on the main board the palette simply does not offer the command.
  useRegisterCommand('configure-lanes', openModal)

  const save = () => {
    void setLanes(draft).then((result) => {
      if (result.ok) setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Configure watchlist lanes"
        data-testid={testIds.laneConfigButton}
        className="border-border text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <SlidersHorizontal size={14} />
        <span>Configure lanes</span>
      </button>
      <LaneConfigModal
        open={open}
        onOpenChange={setOpen}
        definitions={definitions}
        draft={draft}
        onDraftChange={setDraft}
        onAddLane={() => setDraft((prev) => [...prev, { id: newLaneId(), tagIds: [] }])}
        onSave={save}
        isSaving={isPending}
      />
    </>
  )
}
