import { describe, expect, it } from 'vitest'
import type { ClaudeStreamEvent } from './claude-cli'
import {
  EXPLAIN_ALLOWED_TOOLS,
  EXPLAIN_DISALLOWED_TOOLS,
  EXPLAIN_MODEL,
  activityFor,
  buildExplainPrompt,
  explainClaudeArgs,
  explainDiffRange,
  finalReplyFrom,
  streamErrorFrom,
  type ExplainPromptInput,
} from './explain-agent'

const WORKTREE = '/home/dev/projects/worktrees/dr-web-explain/mr-4211'

const INPUT: ExplainPromptInput = {
  mr: {
    iid: 4211,
    title: 'Move rounding out of the pricing service',
    description: 'Callers round now.',
    webUrl: 'https://gitlab.example/group/dr-web/-/merge_requests/4211',
    sourceBranch: 'feat/rounding',
    targetBranch: 'release/25.3',
    headSha: 'deadbeef',
    discussions: 'alice: why here?',
  },
  ticket: {
    key: 'HDR-1',
    summary: 'Rounding is inconsistent',
    description: 'Totals disagree.',
    comments: 'bob: reproduced',
    note: 'watch the invoice path',
  },
  worktreePath: WORKTREE,
}

describe('explainClaudeArgs', () => {
  const args = explainClaudeArgs('REVIEW LIKE AN ARCHITECT')

  it('runs print mode with the streamed machine-readable envelope', () => {
    expect(args.slice(0, 1)).toEqual(['-p'])
    expect(args).toContain('--output-format')
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
    // stream-json is only emitted with --verbose.
    expect(args).toContain('--verbose')
  })

  it('carries the skill body as the appended system prompt', () => {
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('REVIEW LIKE AN ARCHITECT')
  })

  it('pins the model and the containment posture', () => {
    expect(args[args.indexOf('--model') + 1]).toBe(EXPLAIN_MODEL)
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk')
    // No --mcp-config alongside it: zero MCP servers.
    expect(args).toContain('--strict-mcp-config')
    expect(args).not.toContain('--mcp-config')
    // Never: --restricted would strip Bash, which the review needs for history.
    expect(args).not.toContain('--restricted')
    expect(args).not.toContain('--dangerously-skip-permissions')
  })

  it('carries the full allowlist as variadic argv elements', () => {
    const start = args.indexOf('--allowedTools') + 1
    expect(args.slice(start, start + EXPLAIN_ALLOWED_TOOLS.length)).toEqual([
      ...EXPLAIN_ALLOWED_TOOLS,
    ])
  })

  it('carries the full deny list, terminated by nothing after it', () => {
    const start = args.indexOf('--disallowedTools') + 1
    expect(args.slice(start)).toEqual([...EXPLAIN_DISALLOWED_TOOLS])
  })

  it('allows only read-shaped tools', () => {
    // The structural claim: nothing on the allowlist can mutate anything.
    for (const tool of EXPLAIN_ALLOWED_TOOLS) {
      expect(tool).not.toMatch(/^(Write|Edit|MultiEdit|NotebookEdit)$/u)
    }
    expect(EXPLAIN_ALLOWED_TOOLS.filter((t) => t.startsWith('Bash('))).not.toContain(
      'Bash(git commit:*)',
    )
  })

  it('denies every write-shaped tool explicitly', () => {
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      expect(EXPLAIN_DISALLOWED_TOOLS).toContain(tool)
    }
    for (const subcommand of ['git commit', 'git push', 'glab mr merge', 'glab mr approve']) {
      expect(EXPLAIN_DISALLOWED_TOOLS).toContain(`Bash(${subcommand}:*)`)
    }
  })
})

describe('explainDiffRange', () => {
  it('uses the MR’s own target branch, not an assumed develop', () => {
    expect(explainDiffRange('release/25.3', 'deadbeef')).toBe('origin/release/25.3...deadbeef')
  })

  it('uses three dots so the target’s unrelated commits are not the change', () => {
    expect(explainDiffRange('develop', 'abc')).toContain('...')
  })
})

describe('buildExplainPrompt', () => {
  const prompt = buildExplainPrompt(INPUT)

  it('names the MR, its branches, and its head commit', () => {
    expect(prompt).toContain('!4211 — Move rounding out of the pricing service')
    expect(prompt).toContain('feat/rounding → release/25.3')
    expect(prompt).toContain('head: deadbeef')
  })

  it('carries the MR description, the thread, the ticket, and the local note', () => {
    expect(prompt).toContain('Callers round now.')
    expect(prompt).toContain('alice: why here?')
    expect(prompt).toContain('HDR-1 — Rounding is inconsistent')
    expect(prompt).toContain('bob: reproduced')
    expect(prompt).toContain('watch the invoice path')
  })

  it('names the worktree and the diff range as the change', () => {
    expect(prompt).toContain(WORKTREE)
    expect(prompt).toContain('origin/release/25.3...deadbeef')
  })

  it('states the no-install consequence rather than leaving it implied', () => {
    expect(prompt).toContain('cannot install, build, typecheck, or run tests')
  })

  it('renders an absent section as (none) rather than an empty heading', () => {
    const bare = buildExplainPrompt({
      ...INPUT,
      mr: { ...INPUT.mr, description: '', discussions: '  ' },
      ticket: { key: null, summary: '', description: '', comments: '', note: '' },
    })
    expect(bare).toContain('## MR DESCRIPTION (what the author says this does)\n(none)')
    expect(bare).toContain('## TICKET\n(none)')
  })
})

// ---------------------------------------------------------------------------
// Stream translation. Recorded-shape `stream-json` events in, one activity line
// out. This is the only module allowed to know these shapes.
// ---------------------------------------------------------------------------

function assistant(...content: unknown[]): ClaudeStreamEvent {
  return { type: 'assistant', message: { role: 'assistant', content } }
}

const toolUse = (name: string, input: Record<string, unknown>) => ({
  type: 'tool_use',
  id: 'tu_1',
  name,
  input,
})

describe('activityFor', () => {
  it('announces the start on the init event', () => {
    expect(activityFor({ type: 'system', subtype: 'init', tools: [] })).toEqual({
      kind: 'start',
      text: 'Reading the change',
    })
  })

  it('ignores other system events', () => {
    expect(activityFor({ type: 'system', subtype: 'compact_boundary' })).toBeNull()
  })

  it.each([
    [
      'Read',
      { file_path: `${WORKTREE}/src/pricing/quote.ts` },
      { kind: 'read', text: 'src/pricing/quote.ts' },
    ],
    ['Grep', { pattern: 'roundHalfUp' }, { kind: 'search', text: 'roundHalfUp' }],
    ['Glob', { pattern: 'src/**/*.test.ts' }, { kind: 'list', text: 'src/**/*.test.ts' }],
    [
      'Bash',
      { command: 'git log --oneline -- src/pricing' },
      { kind: 'shell', text: 'git log --oneline -- src/pricing' },
    ],
    [
      'WebFetch',
      { url: 'https://example.test/adr' },
      { kind: 'web', text: 'https://example.test/adr' },
    ],
    [
      'WebSearch',
      { query: 'banker rounding money type' },
      { kind: 'web', text: 'banker rounding money type' },
    ],
  ])('maps a %s tool call to its activity line', (name, input, expected) => {
    expect(activityFor(assistant(toolUse(name, input)), { worktreePath: WORKTREE })).toEqual(
      expected,
    )
  })

  it('keeps an absolute path that is not inside the worktree as-is', () => {
    expect(
      activityFor(assistant(toolUse('Read', { file_path: '/etc/hosts' })), {
        worktreePath: WORKTREE,
      }),
    ).toEqual({ kind: 'read', text: '/etc/hosts' })
  })

  it('names a tool it does not recognise rather than dropping it', () => {
    // An unexpected capability should be visible in the log, not invisible.
    expect(activityFor(assistant(toolUse('TodoWrite', {})))).toEqual({
      kind: 'tool',
      text: 'TodoWrite',
    })
  })

  it('turns the assistant’s prose into a thought line', () => {
    expect(
      activityFor(assistant({ type: 'text', text: 'Rounding moved to the callers.' })),
    ).toEqual({ kind: 'thought', text: 'Rounding moved to the callers.' })
  })

  it('prefers the tool call over the prose beside it', () => {
    const event = assistant(
      { type: 'text', text: 'Let me look at the quote builder.' },
      toolUse('Read', { file_path: 'src/q.ts' }),
    )
    expect(activityFor(event)).toEqual({ kind: 'read', text: 'src/q.ts' })
  })

  it('flattens and clips a long thought', () => {
    const long = `${'a'.repeat(200)}\n\nmore`
    const activity = activityFor(assistant({ type: 'text', text: long }))
    expect(activity?.text).toHaveLength(160)
    expect(activity?.text.endsWith('…')).toBe(true)
  })

  it.each([
    ['a tool result', { type: 'user', message: { content: [{ type: 'tool_result' }] } }],
    ['the terminal envelope', { type: 'result', subtype: 'success', result: '{}' }],
    ['an unknown event kind', { type: 'something_new' }],
    ['an event with no type', { message: {} }],
    ['an assistant event with no content', { type: 'assistant', message: {} }],
    ['an assistant event with only empty text', assistant({ type: 'text', text: '   ' })],
    ['a tool call with no path', assistant(toolUse('Read', {}))],
  ])('shows nothing for %s', (_name, event) => {
    expect(activityFor(event as ClaudeStreamEvent)).toBeNull()
  })
})

describe('finalReplyFrom / streamErrorFrom', () => {
  const events: readonly ClaudeStreamEvent[] = [
    { type: 'system', subtype: 'init' },
    assistant(toolUse('Read', { file_path: 'a.ts' })),
    { type: 'result', subtype: 'success', is_error: false, result: '{"version":1,"blocks":[]}' },
  ]

  it('takes the reply off the terminal result event', () => {
    expect(finalReplyFrom(events)).toBe('{"version":1,"blocks":[]}')
    expect(streamErrorFrom(events)).toBeNull()
  })

  it('has no reply when the stream never terminated', () => {
    expect(finalReplyFrom(events.slice(0, 2))).toBeNull()
    expect(streamErrorFrom(events.slice(0, 2))).toBeNull()
  })

  it('reports the CLI’s own error instead of a reply', () => {
    const failed: readonly ClaudeStreamEvent[] = [
      { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'rate limited' },
    ]
    expect(finalReplyFrom(failed)).toBeNull()
    expect(streamErrorFrom(failed)).toBe('rate limited')
  })

  it('falls back to a message when the error event carries no detail', () => {
    expect(streamErrorFrom([{ type: 'result', is_error: true }])).toBe(
      'the explain agent reported an error',
    )
  })

  it('has no reply when the terminal event carries an empty result', () => {
    expect(finalReplyFrom([{ type: 'result', is_error: false, result: '' }])).toBeNull()
  })
})
