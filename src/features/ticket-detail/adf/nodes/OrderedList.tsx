import type { ReactNode } from 'react'

export function OrderedList({ children }: { children: ReactNode }) {
  return <ol className="text-foreground/85 ml-5 list-decimal space-y-1 text-sm">{children}</ol>
}
