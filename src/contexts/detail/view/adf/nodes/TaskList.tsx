import type { ReactNode } from 'react'

export function TaskList({ children }: { children: ReactNode }) {
  return (
    <ul role="list" className="text-foreground/85 ml-1 space-y-1 text-sm">
      {children}
    </ul>
  )
}
