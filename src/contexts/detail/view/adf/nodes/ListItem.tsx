import type { ReactNode } from 'react'

export function ListItem({ children }: { children: ReactNode }) {
  return <li className="[&>p]:inline [&>p]:text-sm">{children}</li>
}
