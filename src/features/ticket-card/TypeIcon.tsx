import { BookOpen, Bug, CheckSquare, Flame, TrendingUp, Zap, type LucideIcon } from 'lucide-react'

type TypeStyle = {
  Icon: LucideIcon
  color: string
  bg: string
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  epic: { Icon: Zap, color: '#a855f7', bg: 'rgba(168, 85, 247, 0.14)' },
  story: { Icon: BookOpen, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)' },
  task: { Icon: CheckSquare, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.14)' },
  bug: { Icon: Bug, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)' },
  improvement: { Icon: TrendingUp, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.14)' },
  spike: { Icon: Flame, color: '#f97316', bg: 'rgba(249, 115, 22, 0.14)' },
}

const FALLBACK: TypeStyle = {
  Icon: CheckSquare,
  color: '#94a3b8',
  bg: 'rgba(148, 163, 184, 0.14)',
}

export function TypeIcon({ type }: { type: string }) {
  const style = TYPE_STYLES[type.toLowerCase()] ?? FALLBACK
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
