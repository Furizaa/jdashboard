import type { ReactNode } from 'react'

export const CODE_BLOCK_PRE_CLASS =
  'bg-muted/50 border-border text-foreground/90 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed'

export function PlainCodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className={CODE_BLOCK_PRE_CLASS}>
      <code>{children}</code>
    </pre>
  )
}
