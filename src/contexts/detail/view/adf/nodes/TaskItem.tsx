import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

export function TaskItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        role="checkbox"
        aria-checked={done}
        aria-disabled
        className={
          done
            ? 'mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-sky-500 bg-sky-500 text-white'
            : 'border-border bg-muted/40 mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border'
        }
      >
        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      <span className={done ? 'text-foreground/50 line-through' : ''}>{children}</span>
    </li>
  )
}
