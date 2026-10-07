import type { ReactElement } from 'react'
import { match } from 'ts-pattern'
import type { ExplainBlock } from '~/kernel'
import { BlastRadiusBlock } from './BlastRadiusBlock'
import { DiagramBlock } from './DiagramBlock'
import { DiffBlock } from './DiffBlock'
import { FindingBlock } from './FindingBlock'
import { ModelBlock } from './ModelBlock'
import { NarrativeBlock } from './NarrativeBlock'
import { QuestionsBlock } from './QuestionsBlock'
import { SystemsBlock } from './SystemsBlock'
import { UnverifiedBlock } from './UnverifiedBlock'
import { VerdictBlock } from './VerdictBlock'

/**
 * One block → one renderer, matched with `ts-pattern.exhaustive()`.
 *
 * This is the invariant the typed-block-document decision was made for
 * (ADR-0009 §7): **adding a block type is a compile error until it has a
 * renderer** — the same guarantee ADF rendering already relies on. A markdown
 * report could not have offered it.
 */
export function renderBlock(block: ExplainBlock): ReactElement {
  return match(block)
    .with({ type: 'verdict' }, (b) => <VerdictBlock block={b} />)
    .with({ type: 'systems' }, (b) => <SystemsBlock block={b} />)
    .with({ type: 'narrative' }, (b) => <NarrativeBlock block={b} />)
    .with({ type: 'diagram' }, (b) => <DiagramBlock block={b} />)
    .with({ type: 'model' }, (b) => <ModelBlock block={b} />)
    .with({ type: 'diff' }, (b) => <DiffBlock block={b} />)
    .with({ type: 'finding' }, (b) => <FindingBlock block={b} />)
    .with({ type: 'blast-radius' }, (b) => <BlastRadiusBlock block={b} />)
    .with({ type: 'questions' }, (b) => <QuestionsBlock block={b} />)
    .with({ type: 'unverified' }, (b) => <UnverifiedBlock block={b} />)
    .exhaustive()
}
