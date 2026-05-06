import { AlertTriangle } from 'lucide-react'
import { cn } from '~/lib/cn'

const ROW_CLASS =
  'flex items-center gap-2 bg-amber-500/10 border-l-2 border-amber-500/40 rounded-b-md px-3 py-1.5 text-[11px]'

export function MrWarning({
  text,
  onClick,
  viewMrUrl,
}: {
  text: string
  onClick?: () => void
  viewMrUrl?: string
}) {
  const icon = <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
  const label = <span className="text-foreground/90">{text}</span>
  const link =
    viewMrUrl !== undefined ? (
      <a
        href={viewMrUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-foreground ml-auto text-[11px] hover:underline"
      >
        View MR ↗
      </a>
    ) : null

  return (
    <div className="border-border/50 -mx-3 -mb-2.5 mt-2 border-t">
      {onClick !== undefined ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(ROW_CLASS, 'hover:bg-amber-500/15 w-full text-left')}
        >
          {icon}
          {label}
          {link}
        </button>
      ) : (
        <div className={ROW_CLASS}>
          {icon}
          {label}
          {link}
        </div>
      )}
    </div>
  )
}
