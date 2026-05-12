import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink-tertiary text-[10px] font-medium tracking-[0.06em] uppercase">
        {label}
      </span>
      <div className="text-[13px]">{children}</div>
    </div>
  )
}
