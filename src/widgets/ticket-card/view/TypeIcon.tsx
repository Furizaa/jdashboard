import { GitMerge } from 'lucide-react'
import { getTypeStyle } from '../domain/type-styles'

export type TypeIconProps = { type: string } | { kind: 'merge-request' }

export function TypeIcon(props: TypeIconProps) {
  if ('type' in props) {
    const style = getTypeStyle(props.type)
    const { Icon } = style
    return (
      <span
        aria-label={props.type}
        title={props.type}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        <Icon size={12} strokeWidth={2.5} />
      </span>
    )
  }
  return (
    <span
      aria-label="Merge request"
      title="Merge request"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
      style={{ backgroundColor: 'rgba(148, 163, 184, 0.14)', color: '#94a3b8' }}
    >
      <GitMerge size={12} strokeWidth={2.5} />
    </span>
  )
}
