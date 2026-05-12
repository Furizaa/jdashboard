import type { ReactNode } from 'react'

export function BoardMessage({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'muted' | 'destructive'
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p
        className={tone === 'destructive' ? 'text-destructive text-sm' : 'text-ink-subtle text-sm'}
      >
        {children}
      </p>
    </div>
  )
}
