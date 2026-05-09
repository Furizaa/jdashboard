import type { ReactNode } from 'react'

type Mark = {
  type: string
  attrs?: Record<string, string | number | boolean | null>
}

export function Text({ text, marks }: { text: string; marks?: Mark[] }): ReactNode {
  let node: ReactNode = text
  if (marks !== undefined) {
    for (const mark of marks) {
      node = applyMark(node, mark)
    }
  }
  return node
}

function applyMark(node: ReactNode, mark: Mark): ReactNode {
  switch (mark.type) {
    case 'strong':
      return <strong className="text-foreground font-semibold">{node}</strong>
    case 'em':
      return <em>{node}</em>
    case 'strike':
      return <s>{node}</s>
    case 'code':
      return (
        <code className="bg-muted/60 text-foreground rounded px-1 py-0.5 font-mono text-[0.85em]">
          {node}
        </code>
      )
    case 'link': {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '#'
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 underline-offset-2 hover:underline"
        >
          {node}
        </a>
      )
    }
    default:
      return node
  }
}
