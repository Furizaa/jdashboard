import { match } from 'ts-pattern'
import { CircleAlert, CircleDot, TriangleAlert } from 'lucide-react'
import type { ExplainSeverity } from '~/kernel'

/**
 * Which colour and glyph a severity reads as. One rule, because the rail's dot
 * and the notebook page's label are two presentations of the *same* judgement —
 * holding it twice is how a palette change makes them disagree.
 *
 * The wrappers stay with their callers: the rail shows a count beside the glyph,
 * the page spells the word out, and only the tone and the glyph are shared.
 */
export function severityStyle(severity: ExplainSeverity): {
  readonly tone: string
  readonly glyph: React.ReactNode
} {
  return match(severity)
    .with('high', () => ({ tone: 'text-destructive', glyph: <CircleAlert size={11} /> }))
    .with('medium', () => ({ tone: 'text-amber-400', glyph: <TriangleAlert size={11} /> }))
    .with('low', () => ({ tone: 'text-ink-subtle', glyph: <CircleDot size={11} /> }))
    .exhaustive()
}
