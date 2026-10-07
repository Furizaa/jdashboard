import type { ExplainBlockOf, ExplainModelCardinality, ExplainModelEntityKind } from '~/kernel'

// A `model` cell → one mermaid `erDiagram`.
//
// The agent sends **data** rather than a drawing (ADR-0011 §2), and this is the
// module that turns it into a picture. That split exists because mermaid's ER
// grammar is much narrower than it looks, in three ways that each turn a good
// model into a blank cell:
//
//   1. An **attribute word** — a field's type and its name — matches
//      `[*A-Za-z_][A-Za-z0-9\-_[\]().,*]*` and nothing else. No spaces, no `<`,
//      no `|`. So `Record<string, Member>` and `string | null`, which is most of
//      what a TypeScript domain is made of, are parse errors. Generics go in
//      **tildes** instead, the way `classDiagram` spells them.
//   2. A **relation label** must be quoted. Unquoted, `one` and `many` are
//      cardinality keywords, so `: one` fails while `: "one"` is fine.
//   3. A **quoted string** cannot contain `%` or a backslash — they are not
//      escapes there, they are syntax errors.
//
// Every rule above was checked against the installed mermaid (12.0.0) rather
// than read off the documentation, which is wrong about the first one.
//
// Pure functions over kernel types. The palette is a **parameter**: hex colours
// belong beside the rest of the diagram theme in the view, not in here.

type ModelBlock = ExplainBlockOf<'model'>

/** One mermaid `classDef` body per entity kind, e.g. `stroke:#a6e3a1`. */
export type ModelEntityStyles = Readonly<Record<ExplainModelEntityKind, string>>

/**
 * Multiplicity only, four ways (ADR-0011 §2). `--` throughout: mermaid's dashed
 * `..` line means a non-identifying relationship, a distinction the cell
 * deliberately does not ask the agent to make.
 */
const CARDINALITY: Readonly<Record<ExplainModelCardinality, string>> = {
  'one-to-one': '||--||',
  'one-to-many': '||--o{',
  'many-to-many': '}o--o{',
  'one-to-optional': '||--o|',
}

/** What survives inside a mermaid quoted string. */
function quoted(raw: string, fallback: string): string {
  const text = raw
    .replaceAll(/["%\\]/gu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim()
  return `"${text === '' ? fallback : text}"`
}

/** Anything still outside the attribute-word set once the rewrites below are done. */
const OUTSIDE_WORD = /[^A-Za-z0-9\-_[\]().,~*]/gu
/** An attribute word may not *start* with a digit, a hyphen or a bracket. */
const BAD_WORD_START = /^[^*A-Za-z_]+/u
/** A word of punctuation is legal and says nothing, so it is not worth drawing. */
const HAS_ALPHANUMERIC = /[A-Za-z0-9]/u

/**
 * A TypeScript type or field name → one attribute word.
 *
 * The rewrites are chosen to stay readable rather than merely legal:
 * `Record<string, Member>` becomes `Record~string,Member~`, `string | null`
 * becomes `string-or-null`, and `readonly Foo[]` becomes `readonly_Foo[]`.
 */
function word(raw: string, fallback: string): string {
  const rewritten = raw
    .replaceAll(/\s*\|\s*/gu, '-or-')
    .replaceAll(/\s*<\s*/gu, '~')
    .replaceAll(/\s*>\s*/gu, '~')
    .replaceAll(/\s*,\s*/gu, ',')
    .replaceAll(/\s+/gu, '_')
    .replaceAll(OUTSIDE_WORD, '_')
  // The generic token needs a *matched pair* of tildes, so one on its own is
  // worse than none: it would take the rest of the line with it.
  const balanced =
    [...rewritten].filter((char) => char === '~').length % 2 === 0
      ? rewritten
      : rewritten.replaceAll('~', '_')
  const trimmed = balanced.replace(BAD_WORD_START, '')
  return HAS_ALPHANUMERIC.test(trimmed) ? trimmed : fallback
}

/**
 * An entity is referred to by a generated id and labelled with an **alias**
 * (`e1["@sdk/usergroup"]`), so the name in the picture is the name the code uses
 * — slashes, dots, spaces and all — while the identifier the relations are
 * written with stays something the grammar accepts.
 */
function idFor(index: number): string {
  return `e${index + 1}`
}

export function mermaidForModel(block: ModelBlock, styles: ModelEntityStyles): string {
  const ids = new Map(block.entities.map((entity, index) => [entity.name, idFor(index)]))
  const lines: string[] = ['erDiagram']

  for (const [index, entity] of block.entities.entries()) {
    const head = `  ${idFor(index)}[${quoted(entity.name, 'unnamed')}]`
    if (entity.fields.length === 0) {
      // A pre-existing type included so a relation has somewhere to land. Bare
      // is legitimate — an empty `{}` would only add a box with a lid.
      lines.push(head)
      continue
    }
    lines.push(`${head} {`)
    for (const field of entity.fields) {
      const note = field.note === undefined ? '' : ` ${quoted(field.note, 'note')}`
      lines.push(`    ${word(field.type, 'unknown')} ${word(field.name, 'field')}${note}`)
    }
    lines.push('  }')
  }

  for (const relation of block.relations) {
    const from = ids.get(relation.from)
    const to = ids.get(relation.to)
    // The schema rejects a relation whose ends are not entities of this cell, so
    // this is unreachable through `parseExplainReport`. It is still checked
    // rather than asserted: a dropped edge is a better failure than a diagram
    // that will not draw at all.
    if (from === undefined || to === undefined) continue
    lines.push(
      `  ${from} ${CARDINALITY[relation.cardinality]} ${to} : ${quoted(relation.label, 'relates to')}`,
    )
  }

  const kinds = [...new Set(block.entities.map((entity) => entity.kind))]
  for (const kind of kinds) {
    const style = styles[kind].trim()
    if (style === '') continue
    lines.push(`  classDef ${kind} ${style}`)
    const members = block.entities
      .map((entity, index) => (entity.kind === kind ? idFor(index) : null))
      .filter((id): id is string => id !== null)
    lines.push(`  class ${members.join(',')} ${kind}`)
  }

  return lines.join('\n')
}
