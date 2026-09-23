import { describe, expect, it } from 'vitest'
import {
  askClaudeArgs,
  buildAskPrompt,
  parseAskResult,
  runAsk,
  type ClaudeRunResult,
  type RunClaude,
} from './ask-ticket'

const envelope = (result: string, extra?: object): ClaudeRunResult => ({
  status: 0,
  stdout: JSON.stringify({ is_error: false, result, ...extra }),
  stderr: '',
})

const answerReply = (answer: string) => JSON.stringify({ answer })

const baseInput = {
  note: 'the note',
  description: 'the description',
  comments: 'the comments',
  linkedTickets: 'blocks HDR-1 — do the thing (In Progress)',
  question: 'the question',
}

describe('askClaudeArgs', () => {
  it('runs headless JSON on opus with the skill as an appended system prompt', () => {
    const args = askClaudeArgs('SKILL BODY')
    expect(args).toContain('-p')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('SKILL BODY')
    expect(args[args.indexOf('--model') + 1]).toBe('opus')
  })

  it('runs read-only: dontAsk mode, web + acli-read allowed, never --restricted', () => {
    const args = askClaudeArgs('x')
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk')
    // --restricted would strip Bash, which Ask needs (scoped acli reads).
    expect(args).not.toContain('--restricted')
    expect(args).toContain('WebFetch')
    expect(args).toContain('WebSearch')
    expect(args).toContain('Bash(acli jira workitem view:*)')
  })

  it('loads zero MCP servers (--strict-mcp-config, no MCP tools) — speed + no headless-auth', () => {
    const args = askClaudeArgs('x')
    expect(args).toContain('--strict-mcp-config')
    expect(args).not.toContain('--mcp-config')
    // No MCP tool appears anywhere — MCP is off in the spawn.
    expect(args.some((a) => a.startsWith('mcp__'))).toBe(false)
  })

  it('forbids every write-shaped tool, including acli writes', () => {
    const args = askClaudeArgs('x')
    const disallowed = args.slice(args.indexOf('--disallowedTools') + 1)
    for (const tool of [
      'Write',
      'Edit',
      'Bash(acli jira workitem edit:*)',
      'Bash(acli jira workitem transition:*)',
    ]) {
      expect(disallowed).toContain(tool)
    }
    // No write-shaped tool leaked into the allowlist.
    const allowed = args.slice(
      args.indexOf('--allowedTools') + 1,
      args.indexOf('--disallowedTools'),
    )
    expect(allowed.some((t) => t.includes('edit') || t.includes('transition'))).toBe(false)
  })
})

describe('buildAskPrompt', () => {
  it('labels each input under its own heading', () => {
    const prompt = buildAskPrompt(baseInput)
    expect(prompt).toContain('the note')
    expect(prompt).toContain('the description')
    expect(prompt).toContain('the comments')
    expect(prompt).toContain('blocks HDR-1')
    expect(prompt).toContain('the question')
    expect(prompt).toMatch(/## QUESTION/u)
    expect(prompt).toMatch(/## LINKED TICKETS/u)
  })

  it('renders an empty input as (none) rather than a blank section', () => {
    const prompt = buildAskPrompt({ ...baseInput, linkedTickets: '', comments: '' })
    expect(prompt).toContain('(none)')
  })

  it('omits the prior-clarifications section on the first round', () => {
    expect(buildAskPrompt(baseInput)).not.toContain('PRIOR CLARIFICATIONS')
  })

  it('renders prior clarifications as Q/A pairs when present', () => {
    const prompt = buildAskPrompt({
      ...baseInput,
      priorAnswers: [{ question: 'Which service?', answer: 'The billing one' }],
    })
    expect(prompt).toContain('## PRIOR CLARIFICATIONS')
    expect(prompt).toContain('Q: Which service?')
    expect(prompt).toContain('A: The billing one')
  })
})

describe('parseAskResult', () => {
  it('extracts the answer from a clean JSON reply', () => {
    expect(parseAskResult(envelope(answerReply('The token expires in 15 minutes.')))).toEqual({
      ok: true,
      kind: 'answer',
      answer: 'The token expires in 15 minutes.',
    })
  })

  it('tolerates prose and ```json fences around the object', () => {
    const wrapped = 'Sure:\n```json\n' + answerReply('42') + '\n```\ndone'
    expect(parseAskResult(envelope(wrapped))).toEqual({ ok: true, kind: 'answer', answer: '42' })
  })

  it('handles braces inside the answer string without truncating', () => {
    expect(parseAskResult(envelope(answerReply('use `{ a: 1 }`')))).toMatchObject({
      ok: true,
      kind: 'answer',
      answer: 'use `{ a: 1 }`',
    })
  })

  it('parses a questions reply instead of an answer', () => {
    const questions = JSON.stringify({
      questions: [
        {
          id: 'which',
          title: 'Which environment?',
          body: 'The note mentions both staging and prod.',
          options: [
            { id: 'stg', label: 'Staging', recommended: true },
            { id: 'prod', label: 'Production' },
          ],
          allowFreeText: true,
        },
      ],
    })
    const result = parseAskResult(envelope(questions))
    expect(result).toMatchObject({ ok: true, kind: 'questions' })
    if (result.ok && result.kind === 'questions') {
      expect(result.questions).toHaveLength(1)
      expect(result.questions[0]).toMatchObject({ id: 'which', title: 'Which environment?' })
      expect(result.questions[0]?.options.filter((o) => o.recommended)).toHaveLength(1)
    }
  })

  it('fails on an empty questions list', () => {
    expect(parseAskResult(envelope(JSON.stringify({ questions: [] })))).toMatchObject({ ok: false })
  })

  it('fails on a spawn error', () => {
    const result = parseAskResult({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('ENOENT claude'),
    })
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error.message).toMatch(/ENOENT claude/u)
  })

  it('fails on a non-zero exit, surfacing stderr', () => {
    const result = parseAskResult({ status: 1, stdout: '', stderr: 'not logged in' })
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error.message).toMatch(/not logged in/u)
  })

  it('fails when the CLI reports is_error', () => {
    expect(
      parseAskResult({
        status: 0,
        stdout: JSON.stringify({ is_error: true, result: 'boom' }),
        stderr: '',
      }),
    ).toMatchObject({ ok: false })
  })

  it('fails when the reply has no JSON object', () => {
    expect(parseAskResult(envelope('I could not do that'))).toMatchObject({ ok: false })
  })

  it('fails when the answer is blank', () => {
    expect(parseAskResult(envelope(answerReply('   ')))).toMatchObject({ ok: false })
  })
})

describe('runAsk', () => {
  it('passes the built args and prompt to the runner and returns the parsed reply', async () => {
    let seenArgs: readonly string[] = []
    let seenStdin = ''
    const run: RunClaude = (args, stdin) => {
      seenArgs = args
      seenStdin = stdin
      return Promise.resolve(envelope(answerReply('here is the answer')))
    }
    const result = await runAsk({ ...baseInput, skillBody: 'SKILL' }, run)
    expect(result).toEqual({ ok: true, kind: 'answer', answer: 'here is the answer' })
    expect(seenArgs[seenArgs.indexOf('--append-system-prompt') + 1]).toBe('SKILL')
    expect(seenStdin).toContain('## QUESTION')
  })
})
