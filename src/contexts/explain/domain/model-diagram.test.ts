import { describe, expect, it } from 'vitest'
import type { ExplainBlockOf } from '~/kernel'
import { mermaidForModel, type ModelEntityStyles } from './model-diagram'

// The interesting half of this module is what it does to strings mermaid's ER
// grammar will not take. Each expectation below pins a rule that was verified
// against the installed mermaid, and the comment says which rule — because the
// published documentation is wrong about the attribute-word charset, so "it
// looks fine" is not evidence here. The e2e spec's stub report then feeds the
// nastiest of these through the real renderer in a real browser.

const STYLES: ModelEntityStyles = {
  added: 'stroke:#added',
  changed: 'stroke:#changed',
  existing: 'stroke:#existing',
}

type ModelBlock = ExplainBlockOf<'model'>

function model(block: Partial<ModelBlock>): ModelBlock {
  return {
    type: 'model',
    entities: [{ name: 'Thing', kind: 'added', fields: [] }],
    relations: [],
    ...block,
  }
}

function field(name: string, type: string, note?: string) {
  return note === undefined ? { name, type } : { name, type, note }
}

describe('mermaidForModel', () => {
  it('opens with the diagram kind and names each entity through an alias', () => {
    // The alias is what lets the picture use the name the code uses: `e1` is
    // grammar, `"@sdk/usergroup"` is the domain.
    const source = mermaidForModel(
      model({
        entities: [{ name: '@sdk/usergroup', kind: 'added', fields: [field('id', 'UsergroupId')] }],
      }),
      STYLES,
    )
    expect(source.split('\n').slice(0, 4)).toEqual([
      'erDiagram',
      '  e1["@sdk/usergroup"] {',
      '    UsergroupId id',
      '  }',
    ])
  })

  it('leaves an entity with no fields bare rather than giving it an empty block', () => {
    const source = mermaidForModel(
      model({ entities: [{ name: 'Account', kind: 'existing', fields: [] }] }),
      STYLES,
    )
    expect(source).toContain('  e1["Account"]\n')
    expect(source).not.toContain('{')
  })

  describe('attribute words', () => {
    // mermaid's attribute word is `[*A-Za-z_][A-Za-z0-9\-_[\]().,*]*`: no space,
    // no angle bracket, no pipe. Generics go in tildes instead.
    it.each([
      ['string', 'string'],
      ['Member[]', 'Member[]'],
      ['Record<string, Member>', 'Record~string,Member~'],
      ['string | null', 'string-or-null'],
      ['Array<Member> | undefined', 'Array~Member~-or-undefined'],
      ['readonly Foo[]', 'readonly_Foo[]'],
      ['sdk.Usergroup', 'sdk.Usergroup'],
      // A leading underscore is a legal start, so it survives; the quotes do not.
      ["'a' | 'b'", '_a_-or-_b_'],
    ])('rewrites the type %s as %s', (raw, expected) => {
      const source = mermaidForModel(
        model({ entities: [{ name: 'T', kind: 'added', fields: [field('x', raw)] }] }),
        STYLES,
      )
      expect(source).toContain(`    ${expected} x`)
    })

    it('drops a lone tilde rather than leaving the pair unmatched', () => {
      // One tilde would swallow the rest of the line: the generic token is
      // `(word)~…~(word)`, so an unbalanced one is worse than none.
      const source = mermaidForModel(
        model({ entities: [{ name: 'T', kind: 'added', fields: [field('x', 'Array<Member')] }] }),
        STYLES,
      )
      expect(source).toContain('    Array_Member x')
    })

    it('strips a leading digit, which an attribute word may not start with', () => {
      const source = mermaidForModel(
        model({ entities: [{ name: 'T', kind: 'added', fields: [field('x', '3DPoint')] }] }),
        STYLES,
      )
      expect(source).toContain('    DPoint x')
    })

    it('falls back on a word that would be all punctuation', () => {
      // `__` is legal and tells the reader nothing, which is the case for saying
      // so instead.
      const source = mermaidForModel(
        model({ entities: [{ name: 'T', kind: 'added', fields: [field('…', '{}')] }] }),
        STYLES,
      )
      expect(source).toContain('    unknown field')
    })

    it('puts a field note in a quoted comment', () => {
      const source = mermaidForModel(
        model({
          entities: [{ name: 'T', kind: 'added', fields: [field('id', 'string', 'the key')] }],
        }),
        STYLES,
      )
      expect(source).toContain('    string id "the key"')
    })
  })

  describe('relations', () => {
    const PAIR = model({
      entities: [
        { name: 'Usergroup', kind: 'added', fields: [] },
        { name: 'Member', kind: 'added', fields: [] },
      ],
    })

    it.each([
      ['one-to-one', '||--||'],
      ['one-to-many', '||--o{'],
      ['many-to-many', '}o--o{'],
      ['one-to-optional', '||--o|'],
    ] as const)('draws %s as %s', (cardinality, symbol) => {
      const source = mermaidForModel(
        {
          ...PAIR,
          relations: [{ from: 'Usergroup', to: 'Member', cardinality, label: 'contains' }],
        },
        STYLES,
      )
      expect(source).toContain(`  e1 ${symbol} e2 : "contains"`)
    })

    it('always quotes the label, because an unquoted one can be a keyword', () => {
      // `: one` and `: many` are cardinality keywords and fail to parse. This is
      // the single most likely thing an agent writes that a hand-rolled mermaid
      // string would have broken on.
      const source = mermaidForModel(
        {
          ...PAIR,
          relations: [
            { from: 'Usergroup', to: 'Member', cardinality: 'one-to-many', label: 'one' },
          ],
        },
        STYLES,
      )
      expect(source).toContain(': "one"')
    })

    it('skips an end that is not an entity of this cell', () => {
      // Unreachable through the schema, which rejects it. Dropping the edge is
      // still better than a diagram that will not draw.
      const source = mermaidForModel(
        {
          ...PAIR,
          relations: [{ from: 'Usergroup', to: 'Ghost', cardinality: 'one-to-many', label: 'has' }],
        },
        STYLES,
      )
      expect(source).not.toContain('--')
    })
  })

  describe('quoted strings', () => {
    // `"[^"%\r\n\v\b\\]+"` — a `%` or a backslash inside quotes is a syntax
    // error, not an escape.
    it.each([
      ['100% new', '100 new'],
      ['a "quoted" name', 'a quoted name'],
      ['back\\slash', 'backslash'],
      ['two   spaces', 'two spaces'],
    ])('strips %s down to %s', (raw, expected) => {
      const source = mermaidForModel(
        model({ entities: [{ name: raw, kind: 'added', fields: [] }] }),
        STYLES,
      )
      expect(source).toContain(`e1["${expected}"]`)
    })

    it('falls back when nothing is left of the name', () => {
      const source = mermaidForModel(
        model({ entities: [{ name: '%%', kind: 'added', fields: [] }] }),
        STYLES,
      )
      expect(source).toContain('e1["unnamed"]')
    })
  })

  describe('entity kinds', () => {
    it('styles only the kinds the cell actually uses, grouping their members', () => {
      const source = mermaidForModel(
        model({
          entities: [
            { name: 'A', kind: 'added', fields: [] },
            { name: 'B', kind: 'existing', fields: [] },
            { name: 'C', kind: 'added', fields: [] },
          ],
        }),
        STYLES,
      )
      expect(source).toContain('  classDef added stroke:#added')
      expect(source).toContain('  class e1,e3 added')
      expect(source).toContain('  class e2 existing')
      expect(source).not.toContain('changed')
    })

    it('emits no styling for a kind whose style is blank', () => {
      const source = mermaidForModel(model({}), { ...STYLES, added: '  ' })
      expect(source).not.toContain('classDef')
      expect(source).not.toContain('class ')
    })
  })
})
