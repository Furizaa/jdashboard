import type { ReactNode } from 'react'

const PANEL_STYLES: Record<string, string> = {
  info: 'border-sky-500/40 bg-sky-500/10',
  note: 'border-violet-500/40 bg-violet-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  error: 'border-red-500/40 bg-red-500/10',
  success: 'border-emerald-500/40 bg-emerald-500/10',
}

export function Panel({ panelType, children }: { panelType: string; children: ReactNode }) {
  const cls = PANEL_STYLES[panelType] ?? PANEL_STYLES.info
  return <div className={`space-y-2 rounded-md border px-3 py-2 ${cls}`}>{children}</div>
}
