import { describe, expect, it } from 'vitest'
import {
  buildRefinePrompt,
  parseRefineResult,
  refineClaudeArgs,
  runRefine,
  type ClaudeRunResult,
  type RunClaude,
} from './refine-note'

const envelope = (result: string, extra?: object): ClaudeRunResult => ({
  status: 0,
  stdout: JSON.stringify({ is_error: false, result, ...extra }),
  stderr: '',
})

const reply = (notes: string, changelog: string) => JSON.stringify({ notes, changelog })

describe('refineClaudeArgs', () => {
  it('runs headless, restricted, JSON, on opus, with the skill as an appended system prompt', () => {
    const args = refineClaudeArgs('SKILL BODY')
    expect(args).toContain('-p')
    expect(args).toContain('--restricted')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('SKILL BODY')
    expect(args[args.indexOf('--model') + 1]).toBe('opus')
  })
})

describe('buildRefinePrompt', () => {
  it('labels each input under its own heading', () => {
    const prompt = buildRefinePrompt({
      note: 'the note',
      description: 'the description',
      comments: 'the comments',
      refineText: 'the transcript',
    })
    expect(prompt).toContain('the note')
    expect(prompt).toContain('the description')
    expect(prompt).toContain('the comments')
    expect(prompt).toContain('the transcript')
    expect(prompt).toMatch(/## REFINE/u)
  })

  it('renders an empty input as (none) rather than a blank section', () => {
    const prompt = buildRefinePrompt({ note: '', description: '', comments: '', refineText: 'x' })
    expect(prompt).toContain('(none)')
  })

  it('omits the prior-clarifications section on the first round', () => {
    const prompt = buildRefinePrompt({ note: '', description: '', comments: '', refineText: 'x' })
    expect(prompt).not.toContain('PRIOR CLARIFICATIONS')
  })

  it('renders prior clarifications as Q/A pairs when present', () => {
    const prompt = buildRefinePrompt({
      note: '',
      description: '',
      comments: '',
      refineText: 'x',
      priorAnswers: [{ question: 'Who owns it?', answer: 'Ada' }],
    })
    expect(prompt).toContain('## PRIOR CLARIFICATIONS')
    expect(prompt).toContain('Q: Who owns it?')
    expect(prompt).toContain('A: Ada')
  })
})

describe('parseRefineResult', () => {
  it('extracts notes and changelog from a clean JSON reply', () => {
    const result = parseRefineResult(envelope(reply('# New note', 'Rewrote the plan.')))
    expect(result).toEqual({
      ok: true,
      kind: 'note',
      notes: '# New note',
      changelog: 'Rewrote the plan.',
    })
  })

  it('tolerates prose and ```json fences around the object', () => {
    const wrapped = 'Here you go:\n```json\n' + reply('N', 'C') + '\n```\nthanks!'
    const result = parseRefineResult(envelope(wrapped))
    expect(result).toEqual({ ok: true, kind: 'note', notes: 'N', changelog: 'C' })
  })

  it('handles braces inside JSON string values without truncating', () => {
    const result = parseRefineResult(envelope(reply('code: `{ a: 1 }`', 'C')))
    expect(result).toMatchObject({ ok: true, kind: 'note', notes: 'code: `{ a: 1 }`' })
  })

  it('parses a questions reply instead of a note', () => {
    const questions = JSON.stringify({
      questions: [
        {
          id: 'owner',
          title: 'Who owns it?',
          body: 'Both Ada and Grace volunteered.',
          options: [
            { id: 'ada', label: 'Ada', recommended: true },
            { id: 'grace', label: 'Grace' },
          ],
          allowFreeText: true,
        },
      ],
    })
    const result = parseRefineResult(envelope(questions))
    expect(result).toMatchObject({ ok: true, kind: 'questions' })
    if (result.ok && result.kind === 'questions') {
      expect(result.questions).toHaveLength(1)
      expect(result.questions[0]).toMatchObject({ id: 'owner', title: 'Who owns it?' })
      expect(result.questions[0]?.options.filter((o) => o.recommended)).toHaveLength(1)
    }
  })

  it('fails on an empty questions list', () => {
    expect(parseRefineResult(envelope(JSON.stringify({ questions: [] })))).toMatchObject({
      ok: false,
    })
  })

  it('fails on a spawn error', () => {
    const result = parseRefineResult({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('ENOENT claude'),
    })
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error.message).toMatch(/ENOENT claude/u)
  })

  it('fails on a non-zero exit, surfacing stderr', () => {
    const result = parseRefineResult({ status: 1, stdout: '', stderr: 'not logged in' })
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error.message).toMatch(/not logged in/u)
  })

  it('fails when the CLI reports is_error', () => {
    const result = parseRefineResult({
      status: 0,
      stdout: JSON.stringify({ is_error: true, result: 'boom' }),
      stderr: '',
    })
    expect(result).toMatchObject({ ok: false })
  })

  it('fails when the reply has no JSON object', () => {
    expect(parseRefineResult(envelope('I could not do that'))).toMatchObject({ ok: false })
  })

  it('fails when the reply object is missing a field', () => {
    expect(parseRefineResult(envelope(JSON.stringify({ notes: 'only notes' })))).toMatchObject({
      ok: false,
    })
  })
})

describe('runRefine', () => {
  it('passes the built args and prompt to the runner and returns the parsed reply', async () => {
    let seenArgs: readonly string[] = []
    let seenStdin = ''
    const run: RunClaude = (args, stdin) => {
      seenArgs = args
      seenStdin = stdin
      return Promise.resolve(envelope(reply('done', 'changed')))
    }
    const result = await runRefine(
      { note: 'n', description: 'd', comments: 'c', refineText: 'r', skillBody: 'SKILL' },
      run,
    )
    expect(result).toEqual({ ok: true, kind: 'note', notes: 'done', changelog: 'changed' })
    expect(seenArgs[seenArgs.indexOf('--append-system-prompt') + 1]).toBe('SKILL')
    expect(seenStdin).toContain('## REFINE')
  })
})
