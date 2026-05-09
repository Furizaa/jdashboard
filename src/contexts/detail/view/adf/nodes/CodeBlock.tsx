import type { ReactNode } from 'react'

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="bg-muted/50 border-border text-foreground/90 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  )
}
