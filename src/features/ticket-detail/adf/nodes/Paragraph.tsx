import type { ReactNode } from 'react'

export function Paragraph({ children }: { children: ReactNode }) {
  return <p className="text-foreground/85 text-sm leading-relaxed">{children}</p>
}
