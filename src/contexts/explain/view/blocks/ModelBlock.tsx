import { Shapes } from 'lucide-react'
import { match } from 'ts-pattern'
import type { ExplainBlockOf, ExplainModelEntityKind } from '~/kernel'
import { cn } from '~/lib/cn'
import { mermaidForModel, type ModelEntityStyles } from '../../domain'
import { MermaidFigure } from './MermaidFigure'

// The shape of the domain after the change, as an entity-relationship diagram.
//
// The cell the Explain surface was missing (ADR-0011): a merge request that adds
// a dozen domain types was being explained in prose and hunks, when the thing an
// architect wants is the picture. The agent sends entities and relations as
// **data** and `mermaidForModel` draws them, so the syntax is ours to get right
// and every model in every report is drawn the same way.
//
// The **legend** under the diagram is not decoration. It carries each entity's
// kind and its one-line note — which is where "three of these nine types are
// new" is actually readable — and it is still there when mermaid fails to draw,
// which is the difference between a degraded cell and an empty one.

/**
 * Mermaid takes literal colours, so these are the hexes behind `SystemsBlock`'s
 * `added` and `changed` badges: one visual language for "this is new" across the
 * report. `existing` is deliberately faint — it is context, not the subject.
 */
const ENTITY_STYLES: ModelEntityStyles = {
  added: 'stroke:#34d399,stroke-width:2px',
  changed: 'stroke:#60a5fa,stroke-width:2px',
  existing: 'stroke:#4b4d57,stroke-width:1px',
}

export function ModelBlock({ block }: { block: ExplainBlockOf<'model'> }) {
  return (
    <MermaidFigure
      kind="model"
      title={block.title ?? 'The model'}
      icon={<Shapes size={12} className="text-ink-tertiary" aria-hidden />}
      source={mermaidForModel(block, ENTITY_STYLES)}
      caption={block.caption}
      footer={
        <ul className="border-border/70 mt-2.5 flex flex-col gap-1.5 border-t pt-2.5">
          {block.entities.map((entity) => (
            <li key={entity.name} className="flex items-baseline gap-2.5">
              <KindBadge kind={entity.kind} />
              <span className="min-w-0">
                <span className="text-foreground font-mono text-xs font-medium">{entity.name}</span>
                {entity.note !== undefined && (
                  <span className="text-ink-subtle ml-2 text-xs leading-relaxed">
                    {entity.note}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      }
    />
  )
}

function KindBadge({ kind }: { kind: ExplainModelEntityKind }) {
  const className = match(kind)
    .with('added', () => 'border-emerald-500/35 text-emerald-400')
    .with('changed', () => 'border-blue-500/35 text-blue-400')
    .with('existing', () => 'border-border text-ink-tertiary')
    .exhaustive()
  return (
    <span
      data-kind={kind}
      className={cn(
        'tracking-chip inline-flex h-4.5 w-18 shrink-0 items-center justify-center rounded border text-[10px] font-medium',
        className,
      )}
    >
      {kind}
    </span>
  )
}
