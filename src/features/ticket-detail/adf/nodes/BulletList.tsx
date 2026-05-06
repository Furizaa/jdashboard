import type { ReactNode } from 'react'

export function BulletList({ children }: { children: ReactNode }) {
  return <ul className="text-foreground/85 ml-5 list-disc space-y-1 text-sm">{children}</ul>
}
