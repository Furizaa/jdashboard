import { getTypeStyle } from './type-styles'

export function TypeIcon({ type }: { type: string }) {
  const style = getTypeStyle(type)
  const { Icon } = style
  return (
    <span
      aria-label={type}
      title={type}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      <Icon size={12} strokeWidth={2.5} />
    </span>
  )
}
