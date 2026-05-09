import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</span>
      <div>{children}</div>
    </div>
  )
}
