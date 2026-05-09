import type { ReactNode } from 'react'

export function Blockquote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="border-border text-foreground/75 space-y-2 border-l-2 pl-3 italic">
      {children}
    </blockquote>
  )
}
