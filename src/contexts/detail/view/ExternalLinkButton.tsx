import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'

export function ExternalLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
    >
      <span>{children}</span>
      <ExternalLink size={12} />
    </a>
  )
}
