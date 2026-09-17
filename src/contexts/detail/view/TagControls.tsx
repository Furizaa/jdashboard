import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAttachTag, useDetachTag, useTagDefinitions, useTicketTags } from '~/coordinator'
import { resolveTagColor, type TagMutationResult } from '~/kernel'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'

// Attach / detach local tags for one ticket. Detail cannot import the tags
// context directly (no cross-context edge), so it consumes the tag hooks through
// the coordinator and renders its own UI — mirroring how `WatchlistAction` works.
// Defining and recolouring tags lives in the header tag manager, not here.
export function TagControls({ issueKey }: { issueKey: string }) {
  const definitions = useTagDefinitions()
  const attached = useTicketTags(issueKey)
  const { attach } = useAttachTag()
  const { detach } = useDetachTag()
  const [picking, setPicking] = useState(false)

  const attachedIds = new Set(attached.map((t) => t.id))

  const report = (verb: string, run: Promise<TagMutationResult>) => {
    run
      .then((result) => {
        if (!result.ok) toast.error(`${verb} failed: ${result.error.message}`)
      })
      .catch((error: unknown) => {
        toast.error(`${verb} failed: ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testIds.tagControls}>
      {attached.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attached.map((tag) => {
            const color = resolveTagColor(tag.colorId)
            return (
              <span
                key={tag.id}
                data-testid={testIds.tagControlChip}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-medium"
                style={{ backgroundColor: color.swatchBg, color: color.swatchFg }}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => report('Remove tag', detach(issueKey, tag.id))}
                  aria-label={`Remove ${tag.name}`}
                  className="inline-flex items-center opacity-70 hover:opacity-100"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {definitions.length === 0 ? (
        <span className="text-ink-tertiary">No tags defined — add some from the Tags menu.</span>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            data-testid={testIds.tagAttachToggle}
            className="border-border bg-surface-1 text-ink-subtle hover:bg-surface-2 hover:text-foreground focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <Plus size={12} />
            <span>Add tag</span>
          </button>
          {picking && (
            <div className="border-border bg-surface-1 absolute left-0 z-10 mt-1 flex max-h-56 w-56 flex-col gap-0.5 overflow-y-auto rounded-md border p-1 shadow-md">
              {definitions.map((tag) => {
                const color = resolveTagColor(tag.colorId)
                const isAttached = attachedIds.has(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      report(
                        isAttached ? 'Remove tag' : 'Attach tag',
                        isAttached ? detach(issueKey, tag.id) : attach(issueKey, tag.id),
                      )
                    }
                    aria-pressed={isAttached}
                    data-testid={testIds.tagAttachOption}
                    className="hover:bg-surface-2 focus-visible:ring-ring flex items-center gap-2 rounded px-1.5 py-1 text-left focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-4 shrink-0 items-center rounded px-1.5 text-[10px] leading-none font-medium"
                      style={{ backgroundColor: color.swatchBg, color: color.swatchFg }}
                    >
                      {tag.name}
                    </span>
                    <Check
                      size={13}
                      className={cn('ml-auto shrink-0', isAttached ? 'opacity-100' : 'opacity-0')}
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
