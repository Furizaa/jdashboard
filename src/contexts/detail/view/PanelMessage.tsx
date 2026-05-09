import type { ReactNode } from 'react'

export function PanelMessage({ children }: { children: ReactNode }) {
  return <div className="text-muted-foreground p-6 text-sm">{children}</div>
}
