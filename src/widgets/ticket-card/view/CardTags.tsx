import { useTicketTags } from '~/coordinator'
import { resolveTagColor } from '~/kernel'
import { testIds } from '~/lib/testids'

const MAX_VISIBLE_TAGS = 4

// A card's local tags, rendered as a full-bleed divided row below the body —
// the same divider idiom the MR reviewer row uses (`-mx-3.5 border-t`), so a
// tagged card gains a clearly separated strip of coloured chips. No negative
// bottom margin: the MR section (when present) follows and adds its own divider;
// when absent the card's own bottom padding closes the row cleanly.
export function CardTags({ issueKey }: { issueKey: string }) {
  const tags = useTicketTags(issueKey)
  if (issueKey === '' || tags.length === 0) return null

  const visible = tags.slice(0, MAX_VISIBLE_TAGS)
  const overflow = tags.length - visible.length

  return (
    <div
      data-testid={testIds.cardTagRow}
      className="border-border -mx-3.5 mt-2.5 flex flex-wrap items-center gap-1.5 border-t px-3.5 pt-2"
    >
      {visible.map((tag) => {
        const color = resolveTagColor(tag.colorId)
        return (
          <span
            key={tag.id}
            data-testid={testIds.cardTagChip}
            title={tag.name}
            className="inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[10px] leading-none font-medium"
            style={{ backgroundColor: color.swatchBg, color: color.swatchFg }}
          >
            {tag.name}
          </span>
        )
      })}
      {overflow > 0 && (
        <span
          data-testid={testIds.cardTagOverflowChip}
          className="border-border text-ink-subtle rounded-full border px-1.5 py-0.5 text-[10px] leading-none"
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
