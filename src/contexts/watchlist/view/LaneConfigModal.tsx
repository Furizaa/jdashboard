import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '~/design-system'
import { resolveTagColor, type TagDefinition, type WatchlistLaneConfig } from '~/kernel'
import { testIds } from '~/lib/testids'

// Pure ordered-list helpers over the lane draft. Kept inline: they are trivial
// array ops on a self-contained modal draft, below the threshold for a view-model
// split. Each returns a new array (never mutates the draft).
type Lanes = readonly WatchlistLaneConfig[]

function moveLane(lanes: Lanes, index: number, delta: number): WatchlistLaneConfig[] {
  const target = index + delta
  if (target < 0 || target >= lanes.length) return [...lanes]
  const next = [...lanes]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return next
}
function mapLane(
  lanes: Lanes,
  index: number,
  fn: (lane: WatchlistLaneConfig) => WatchlistLaneConfig,
): WatchlistLaneConfig[] {
  return lanes.map((lane, i) => (i === index ? fn(lane) : lane))
}
function addTag(lanes: Lanes, index: number, tagId: string): WatchlistLaneConfig[] {
  return mapLane(lanes, index, (lane) =>
    lane.tagIds.includes(tagId) ? lane : { ...lane, tagIds: [...lane.tagIds, tagId] },
  )
}
function removeTag(lanes: Lanes, index: number, tagId: string): WatchlistLaneConfig[] {
  return mapLane(lanes, index, (lane) => ({
    ...lane,
    tagIds: lane.tagIds.filter((id) => id !== tagId),
  }))
}

/** Maps the user's tags to ordered swimlanes on the Watchlist Board. Each lane
 * holds one or more tags (a card matching any of a lane's tags lands in it). The
 * draft is owned by the parent button and persisted on Save; tagless lanes are
 * dropped by the store. */
export function LaneConfigModal({
  open,
  onOpenChange,
  definitions,
  draft,
  onDraftChange,
  onAddLane,
  onSave,
  isSaving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  definitions: readonly TagDefinition[]
  draft: Lanes
  onDraftChange: (next: Lanes) => void
  onAddLane: () => void
  onSave: () => void
  isSaving: boolean
}) {
  const byId = new Map(definitions.map((d) => [d.id, d]))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-testid={testIds.laneConfigModal}
        className="w-[min(34rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
      >
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <DialogTitle className="text-foreground text-[15px] font-semibold tracking-[-0.015em]">
              Configure lanes
            </DialogTitle>
            <DialogClose
              aria-label="Close"
              className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <X size={14} />
            </DialogClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {definitions.length === 0 ? (
              <p className="text-ink-tertiary py-3 text-xs">
                No tags defined yet. Create tags first (Tags in the header), then map them to lanes.
              </p>
            ) : draft.length === 0 ? (
              <p className="text-ink-tertiary py-3 text-xs">
                No lanes yet. Add one below, then add tags to it.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {draft.map((lane, index) => (
                  <LaneRow
                    key={lane.id}
                    lane={lane}
                    index={index}
                    total={draft.length}
                    byId={byId}
                    definitions={definitions}
                    onMoveUp={() => onDraftChange(moveLane(draft, index, -1))}
                    onMoveDown={() => onDraftChange(moveLane(draft, index, 1))}
                    onDelete={() => onDraftChange(draft.filter((_, i) => i !== index))}
                    onAddTag={(tagId) => onDraftChange(addTag(draft, index, tagId))}
                    onRemoveTag={(tagId) => onDraftChange(removeTag(draft, index, tagId))}
                  />
                ))}
              </div>
            )}

            {definitions.length > 0 && (
              <button
                type="button"
                onClick={onAddLane}
                data-testid={testIds.laneConfigAddLane}
                className="border-border text-ink-subtle hover:text-foreground hover:bg-surface-2 mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed px-3 text-xs font-medium transition-colors"
              >
                <Plus size={14} />
                <span>Add lane</span>
              </button>
            )}
          </div>

          <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
            <DialogClose className="text-ink-subtle hover:text-foreground hover:bg-surface-2 inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors">
              Cancel
            </DialogClose>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LaneRow({
  lane,
  index,
  total,
  byId,
  definitions,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAddTag,
  onRemoveTag,
}: {
  lane: WatchlistLaneConfig
  index: number
  total: number
  byId: ReadonlyMap<string, TagDefinition>
  definitions: readonly TagDefinition[]
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onAddTag: (tagId: string) => void
  onRemoveTag: (tagId: string) => void
}) {
  const laneTags = lane.tagIds.flatMap((id) => {
    const def = byId.get(id)
    return def === undefined ? [] : [def]
  })
  const available = definitions.filter((d) => !lane.tagIds.includes(d.id))

  return (
    <div
      data-testid={testIds.laneConfigLaneRow}
      className="border-border bg-surface-1 flex flex-col gap-2 rounded-md border px-2.5 py-2"
    >
      <div className="flex items-center gap-2">
        <span className="text-ink-tertiary w-4 text-center text-[11px] tabular-nums">
          {index + 1}
        </span>
        <span className="text-ink-subtle text-[11px] font-medium tracking-[0.04em] uppercase">
          Lane {index + 1}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            data-testid={testIds.laneConfigMoveUp}
            aria-label={`Move lane ${index + 1} up`}
            className="text-ink-tertiary hover:text-ink-subtle hover:bg-surface-2 inline-flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            data-testid={testIds.laneConfigMoveDown}
            aria-label={`Move lane ${index + 1} down`}
            className="text-ink-tertiary hover:text-ink-subtle hover:bg-surface-2 inline-flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
          >
            <ArrowDown size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            data-testid={testIds.laneConfigDeleteLane}
            aria-label={`Delete lane ${index + 1}`}
            className="text-ink-tertiary hover:text-destructive hover:bg-surface-2 inline-flex h-6 w-6 items-center justify-center rounded"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {laneTags.length === 0 ? (
          <span className="text-ink-tertiary text-xs">No tags — add one below.</span>
        ) : (
          laneTags.map((tag) => {
            const color = resolveTagColor(tag.colorId)
            return (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-[11px] font-medium"
                style={{ backgroundColor: color.swatchBg, color: color.swatchFg }}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag.id)}
                  data-testid={testIds.laneConfigTagToggle}
                  aria-label={`Remove ${tag.name} from lane ${index + 1}`}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/20"
                >
                  <X size={11} />
                </button>
              </span>
            )
          })
        )}
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((tag) => {
            const color = resolveTagColor(tag.colorId)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onAddTag(tag.id)}
                data-testid={testIds.laneConfigTagToggle}
                aria-label={`Add ${tag.name} to lane ${index + 1}`}
                className="border-border hover:bg-surface-2 inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-1.5 text-[12px]"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color.swatchBg }}
                  aria-hidden
                />
                <span className="text-foreground">{tag.name}</span>
                <Plus size={12} className="text-ink-tertiary" aria-hidden />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
