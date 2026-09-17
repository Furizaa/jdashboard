import { useState } from 'react'
import { Palette, Trash2 } from 'lucide-react'
import { resolveTagColor, type TagDefinition } from '~/kernel'
import { testIds } from '~/lib/testids'
import type { TagManagerApi } from '../presenter'
import { TagColorPicker } from './TagColorPicker'

// One existing tag: a chip preview, an inline-editable name (uncontrolled — saves
// on blur / Enter, so there is no prop-mirroring state to keep in sync), a colour
// popover, and a delete button. The tag-manager reducer owns only the create
// draft; per-row UI (the open colour popover) is plain local state.
export function TagManagerRow({ tag, manager }: { tag: TagDefinition; manager: TagManagerApi }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const color = resolveTagColor(tag.colorId)

  const commitName = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length > 0 && trimmed !== tag.name) void manager.renameTag(tag.id, trimmed)
  }

  return (
    <div
      data-testid={testIds.tagManagerRow}
      className="border-border flex items-center gap-2 rounded-md border px-2 py-1.5"
    >
      <span
        aria-hidden
        className="inline-flex h-5 shrink-0 items-center rounded px-2 text-[11px] font-medium"
        style={{ backgroundColor: color.swatchBg, color: color.swatchFg }}
      >
        {tag.name}
      </span>
      <input
        // keyed on the persisted name so an external rename reseeds the field
        key={tag.name}
        type="text"
        defaultValue={tag.name}
        onBlur={(e) => commitName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            e.currentTarget.value = tag.name
            e.currentTarget.blur()
          }
        }}
        aria-label={`Rename ${tag.name}`}
        maxLength={40}
        className="text-foreground min-w-0 flex-1 bg-transparent text-xs outline-none"
      />
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label={`Change colour of ${tag.name}`}
          aria-expanded={pickerOpen}
          className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Palette size={13} />
        </button>
        {pickerOpen && (
          <div className="border-border bg-surface-1 absolute right-0 z-10 mt-1 rounded-md border p-2 shadow-md">
            <TagColorPicker
              selectedColorId={tag.colorId}
              onSelect={(colorId) => {
                setPickerOpen(false)
                void manager.recolorTag(tag.id, colorId)
              }}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => void manager.deleteTag(tag.id)}
        aria-label={`Delete ${tag.name}`}
        data-testid={testIds.tagDeleteButton}
        className="text-ink-subtle hover:text-destructive hover:bg-surface-2 focus-visible:ring-ring inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
