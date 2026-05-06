import type { ReactNode } from 'react'

const SIZES: Record<number, string> = {
  1: 'text-xl font-semibold mt-2',
  2: 'text-lg font-semibold mt-2',
  3: 'text-base font-semibold mt-1.5',
  4: 'text-sm font-semibold mt-1.5',
  5: 'text-sm font-medium',
  6: 'text-xs font-medium uppercase tracking-wide',
}

export function Heading({ level, children }: { level: number; children: ReactNode }) {
  const lvl = Math.min(Math.max(level, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6
  const className = `text-foreground leading-snug ${SIZES[lvl]}`
  switch (lvl) {
    case 1:
      return <h1 className={className}>{children}</h1>
    case 2:
      return <h2 className={className}>{children}</h2>
    case 3:
      return <h3 className={className}>{children}</h3>
    case 4:
      return <h4 className={className}>{children}</h4>
    case 5:
      return <h5 className={className}>{children}</h5>
    case 6:
      return <h6 className={className}>{children}</h6>
  }
}
