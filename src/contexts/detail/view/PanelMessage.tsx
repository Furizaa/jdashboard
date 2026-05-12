import type { ReactNode } from 'react'

export function PanelMessage({ children }: { children: ReactNode }) {
  return <div className="text-ink-subtle p-7 text-sm">{children}</div>
}
