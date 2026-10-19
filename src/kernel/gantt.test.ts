import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// `kernel/gantt.ts` is a **type-only** barrel, and that is a property of the
// source rather than of anything the type checker will complain about on its
// own: `export { ganttChartSchema } from '~/server/lib/gantt-schema'` compiles
// perfectly well, and would quietly pull Zod and the whole write-surface
// contract into every client module that touches the kernel.
//
// The Gantt UI is read-only by design (ADR-0012 §8) — the agent is the only
// writer, and it writes over HTTP — so a client module holding a body schema
// would be holding a tool for a job it is not allowed to do. This reads the file
// and asserts every export is a `export type`.

const source = readFileSync(join(process.cwd(), 'src', 'kernel', 'gantt.ts'), 'utf8')

describe('kernel/gantt', () => {
  it('re-exports types and nothing else', () => {
    const exports = source.match(/^export\b.*$/gmu) ?? []
    expect(exports.length).toBeGreaterThan(0)
    const values = exports.filter((line) => !line.startsWith('export type '))
    expect(values, `these exports are values, not types: ${values.join(' / ')}`).toEqual([])
  })

  it('names the chart shapes the Gantt context renders', () => {
    for (const shape of [
      'GanttChart',
      'GanttNode',
      'GanttEdge',
      'GanttNodeSource',
      'GanttEdgeSource',
      'GanttChartSummary',
      'GanttChangelogEntry',
    ]) {
      expect(source).toContain(shape)
    }
  })
})
