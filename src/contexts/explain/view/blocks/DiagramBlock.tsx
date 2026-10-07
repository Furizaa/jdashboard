import { Workflow } from 'lucide-react'
import type { ExplainBlockOf } from '~/kernel'
import { MermaidFigure } from './MermaidFigure'

// A diagram, for the changes that are structural: a new call path, a changed
// dependency direction, a new sequence between services. Something to see rather
// than reconstruct.
//
// The agent writes the mermaid here. When what it wants to draw is the *shape of
// the domain* — types and how they relate — it sends a `model` cell instead and
// we draw it (ADR-0011): an ER diagram is the one picture whose syntax an agent
// reliably gets wrong, and the one whose styling is worth keeping ours.
//
// Everything about rendering one lives in `MermaidFigure`.

export function DiagramBlock({ block }: { block: ExplainBlockOf<'diagram'> }) {
  return (
    <MermaidFigure
      kind="diagram"
      title={block.title ?? 'Structure'}
      icon={<Workflow size={12} className="text-ink-tertiary" aria-hidden />}
      source={block.mermaid}
      caption={block.caption}
    />
  )
}
