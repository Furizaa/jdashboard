import { Check } from 'lucide-react'
import { TAG_COLORS } from '~/kernel'
import { testIds } from '~/lib/testids'
import { cn } from '~/lib/cn'

// The 20-swatch palette grid. Used for both the create draft and per-tag
// recolouring. The selected swatch carries a check; `critical` (white/red) reads
// as a bright chip against the dark surface without extra treatment.
export function TagColorPicker({
  selectedColorId,
  onSelect,
}: {
  selectedColorId: string
  onSelect: (colorId: string) => void
}) {
  return (
    <div
      role="listbox"
      aria-label="Tag colour"
      data-testid={testIds.tagColorPicker}
      className="grid grid-cols-10 gap-1.5"
    >
      {TAG_COLORS.map((color) => {
        const selected = color.id === selectedColorId
        return (
          <button
            key={color.id}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={color.name}
            title={color.name}
            onClick={() => onSelect(color.id)}
            data-testid={testIds.tagColorSwatch}
            className={cn(
              'ring-offset-background focus-visible:ring-ring flex h-6 w-6 items-center justify-center rounded-md border transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none',
              selected ? 'border-foreground' : 'border-border',
            )}
            style={{ backgroundColor: color.swatchBg, color: color.swatchFg }}
          >
            {selected && <Check size={12} strokeWidth={3} />}
          </button>
        )
      })}
    </div>
  )
}
