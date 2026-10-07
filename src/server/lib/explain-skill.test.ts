import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXPLAIN_SKILL_PATH } from './explain-agent'
import { explainBlockSchema } from './explain-blocks'

// The skill and the schema are two halves of one contract, and only one half is
// type-checked. The schema says what a cell may be; the **skill is the only place
// the agent learns a cell's field names**, so a field the skill never names is a
// field the agent has to guess — and it guesses wrong.
//
// That is not hypothetical. Rewriting the skill for ADR-0011 dropped the one
// worked example of a `diagram` cell, leaving its payload described only as
// "Mermaid source" with the field `mermaid` never written down. The next run
// invented a key, and a 20-minute agent run was rejected at the boundary with
// `moves.1.blocks.1.mermaid: expected string, received undefined`.
//
// So this walks the union and asserts the instructions mention every cell type
// and every field that is required to fill one. It is a crude check — a word
// appearing anywhere counts — but the failure it exists to catch is a word
// appearing *nowhere*.

const skill = readFileSync(EXPLAIN_SKILL_PATH, 'utf8')

/** The union's arms, introspected rather than listed, so a new cell is covered the day it is added. */
type Arm = {
  shape: Record<string, { safeParse: (value: unknown) => { success: boolean } }>
}

const ARMS: ReadonlyArray<readonly [string, Arm]> = (
  explainBlockSchema as unknown as { options: Arm[] }
).options.map((arm) => {
  const literal = arm.shape.type as unknown as { value: string }
  return [literal.value, arm] as const
})

/** A field the agent must supply: everything that does not accept `undefined`. */
function requiredFieldsOf(arm: Arm): readonly string[] {
  return Object.keys(arm.shape).filter(
    (key) => key !== 'type' && !arm.shape[key]!.safeParse(undefined).success,
  )
}

describe('the explain skill', () => {
  it('covers every cell type in the union', () => {
    // Ten arms today. The count is asserted so that adding a cell without
    // telling the agent about it fails here rather than at 3am in a real run.
    expect(ARMS).toHaveLength(10)
  })

  it.each(ARMS)('names the %s cell', (type) => {
    expect(skill).toContain(`"${type}"`)
  })

  it.each(ARMS)('names every field required to fill a %s cell', (type, arm) => {
    const required = requiredFieldsOf(arm)
    expect(required.length).toBeGreaterThan(0)
    const missing = required.filter((field) => !skill.includes(field))
    expect(missing, `the skill never names ${missing.join(', ')} for the ${type} cell`).toEqual([])
  })

  it('shows a worked example of each drawing cell, since both are easy to confuse', () => {
    // The two cells that produce a picture are the ones an agent mixes up: the
    // model is data we draw, the diagram is source it writes.
    expect(skill).toContain('"type": "diagram"')
    expect(skill).toContain('"type": "model"')
    expect(skill).toContain('"mermaid"')
  })

  it('still tells the agent to return one JSON object and nothing else', () => {
    expect(skill).toContain('Return **only** a single JSON object')
  })
})
