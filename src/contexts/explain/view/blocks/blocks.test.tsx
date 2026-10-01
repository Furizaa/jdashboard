import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ExplainBlock } from '~/kernel'
import { renderBlock } from './index'
import { parseUnifiedDiff } from './DiffHunk'
import { EVERY_BLOCK_REPORT } from './__fixtures__/report'

afterEach(() => {
  cleanup()
})

// Snapshots over one fixture report containing every block type — the pattern
// `RenderAdf.test.tsx.snap` already establishes (ADR-0009, Tests). This is the
// renderers' whole coverage: a full e2e asserting a *persisted* report would
// have to write to `~/.clashboard`, which is deliberately out of scope.

function html(block: ExplainBlock): string {
  return render(renderBlock(block)).container.innerHTML
}

describe('renderBlock', () => {
  it.each(EVERY_BLOCK_REPORT.blocks.map((block) => [block.type, block] as const))(
    'renders a %s block',
    (_type, block) => {
      expect(html(block)).toMatchSnapshot()
    },
  )

  it('covers every block type the union can hold', () => {
    // If a new block type is added, the schema accepts it and `renderBlock`
    // fails to compile until it has a renderer — but nothing would force it
    // into the fixture. This is what does.
    const covered = new Set(EVERY_BLOCK_REPORT.blocks.map((block) => block.type))
    expect([...covered].toSorted()).toEqual([
      'blast-radius',
      'diagram',
      'finding',
      'narrative',
      'questions',
      'systems',
      'unverified',
      'verdict',
    ])
  })
})

describe('verdict tones', () => {
  it.each(['sound', 'discuss', 'blocked'] as const)('renders the %s verdict', (verdict) => {
    expect(html({ type: 'verdict', verdict, headline: 'One line' })).toMatchSnapshot()
  })
})

describe('finding severities', () => {
  it.each(['high', 'medium', 'low'] as const)('renders a %s finding', (severity) => {
    expect(
      html({
        type: 'finding',
        system: 'pricing',
        title: 'Something structural',
        severity,
        whyItMatters: 'Because a contract changed.',
      }),
    ).toMatchSnapshot()
  })

  it('renders a finding with no hunk and no detail', () => {
    expect(
      html({
        type: 'finding',
        system: 'pricing',
        title: 'Bare finding',
        severity: 'low',
        whyItMatters: 'Still has to say why.',
      }),
    ).toMatchSnapshot()
  })
})

describe('system change kinds', () => {
  it('renders every change kind', () => {
    expect(
      html({
        type: 'systems',
        systems: (['added', 'changed', 'contract-changed', 'removed', 'read-only'] as const).map(
          (change) => ({ name: change, role: `is ${change}`, change }),
        ),
      }),
    ).toMatchSnapshot()
  })
})

describe('a diagram block', () => {
  it('renders the loading state while mermaid is still being imported', () => {
    // Mermaid is `import()`-ed per diagram block, so a report without one pays
    // nothing. The consequence here is that the first paint is always the
    // placeholder — which is exactly what proves the import is lazy.
    const markup = html({ type: 'diagram', mermaid: 'flowchart LR\n  a --> b' })
    expect(markup).toContain('data-status="loading"')
    expect(markup).toMatchSnapshot()
  })
})

describe('parseUnifiedDiff', () => {
  it('classifies hunk headers, additions, removals, and context', () => {
    expect(parseUnifiedDiff('@@ -1,3 +1,3 @@\n context\n-old\n+new')).toEqual([
      { kind: 'hunk', text: '@@ -1,3 +1,3 @@' },
      { kind: 'context', text: 'context' },
      { kind: 'removed', text: 'old' },
      { kind: 'added', text: 'new' },
    ])
  })

  it('tolerates a context line with no leading space', () => {
    // Agents (and hand-pasted diffs) drop it routinely.
    expect(parseUnifiedDiff('context')).toEqual([{ kind: 'context', text: 'context' }])
  })

  it('treats file headers and the no-newline marker as metadata', () => {
    expect(parseUnifiedDiff('--- a/x\n+++ b/x\n\\ No newline at end of file')).toEqual([
      { kind: 'meta', text: '--- a/x' },
      { kind: 'meta', text: '+++ b/x' },
      { kind: 'meta', text: '\\ No newline at end of file' },
    ])
  })

  it('reads a trailing newline as a terminator, not an empty line', () => {
    expect(parseUnifiedDiff('+one\n')).toHaveLength(1)
  })
})
