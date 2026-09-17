import { describe, expect, it } from 'vitest'
import type { ClaudeRunResult, RunClaude } from './claude-cli'
import {
  buildRoutePrompt,
  canonicalKeyMap,
  parseRouteResult,
  routeClaudeArgs,
  runRoute,
  type RouteTicket,
} from './route-transcript'

const envelope = (result: string): ClaudeRunResult => ({
  status: 0,
  stdout: JSON.stringify({ is_error: false, result }),
  stderr: '',
})

// The agent's delimited reply: one `@@TICKET <key>` block per match.
const reply = (blocks: { key: string; brief: string }[]) =>
  blocks.map((b) => `@@TICKET ${b.key}\n${b.brief}`).join('\n\n')

const ticket = (key: string, over: Partial<RouteTicket> = {}): RouteTicket => ({
  key,
  summary: `${key} summary`,
  epic: null,
  labels: [],
  ...over,
})

// The offered-keys map the parser filters against.
const offered = (...ks: string[]) => canonicalKeyMap(ks.map((k) => ticket(k)))

describe('routeClaudeArgs', () => {
  it('runs headless, restricted, JSON, on opus, with the skill as an appended system prompt', () => {
    const args = routeClaudeArgs('SKILL BODY')
    expect(args).toContain('-p')
    expect(args).toContain('--restricted')
    expect(args[args.indexOf('--output-format') + 1]).toBe('json')
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('SKILL BODY')
    expect(args[args.indexOf('--model') + 1]).toBe('opus')
  })
})

describe('buildRoutePrompt', () => {
  it('lists each ticket with its summary, epic, and labels, and includes the transcript', () => {
    const prompt = buildRoutePrompt({
      transcript: 'we agreed to drop the cache',
      tickets: [
        {
          key: 'HDR-1',
          summary: 'Login timeout',
          epic: 'Auth hardening',
          labels: ['security', 'fe'],
        },
        { key: 'HDR-2', summary: 'Cache layer', epic: null, labels: [] },
      ],
    })
    expect(prompt).toContain(
      '- HDR-1 — Login timeout  ·  epic: Auth hardening  ·  labels: security, fe',
    )
    expect(prompt).toContain('- HDR-2 — Cache layer')
    expect(prompt).toContain('we agreed to drop the cache')
    expect(prompt).toMatch(/## TRANSCRIPT/u)
  })

  it('renders empty tickets and transcript as (none)', () => {
    const prompt = buildRoutePrompt({ transcript: '  ', tickets: [] })
    expect(prompt.match(/\(none\)/gu)).toHaveLength(2)
  })
})

describe('parseRouteResult', () => {
  it('extracts matches for valid keys', () => {
    const run = envelope(
      reply([
        { key: 'HDR-1', brief: 'Drop the session cookie.' },
        { key: 'HDR-2', brief: 'Ship behind a flag.' },
      ]),
    )
    expect(parseRouteResult(run, offered('HDR-1', 'HDR-2'))).toEqual({
      ok: true,
      matches: [
        { key: 'HDR-1', brief: 'Drop the session cookie.' },
        { key: 'HDR-2', brief: 'Ship behind a flag.' },
      ],
    })
  })

  it('drops matches whose key was not offered', () => {
    const run = envelope(reply([{ key: 'HDR-9', brief: 'not on the board' }]))
    expect(parseRouteResult(run, offered('HDR-1'))).toEqual({ ok: true, matches: [] })
  })

  it('matches an offered key case-insensitively, returning the canonical key', () => {
    const run = envelope(reply([{ key: 'hdr-1', brief: 'still lands' }]))
    expect(parseRouteResult(run, offered('HDR-1'))).toEqual({
      ok: true,
      matches: [{ key: 'HDR-1', brief: 'still lands' }],
    })
  })

  it('keeps a multi-line brief with quotes, braces, and blank lines intact', () => {
    const brief = 'Line one.\n\n- a bullet with "quotes"\n- code: `{ a: 1 }`'
    const run = envelope(reply([{ key: 'HDR-1', brief }]))
    expect(parseRouteResult(run, offered('HDR-1'))).toEqual({
      ok: true,
      matches: [{ key: 'HDR-1', brief }],
    })
  })

  it('ignores any preamble before the first ticket block', () => {
    const run = envelope(
      'Here are the tickets I found:\n\n' + reply([{ key: 'HDR-1', brief: 'b' }]),
    )
    expect(parseRouteResult(run, offered('HDR-1'))).toEqual({
      ok: true,
      matches: [{ key: 'HDR-1', brief: 'b' }],
    })
  })

  it('drops empty briefs and de-duplicates by key, trimming', () => {
    const run = envelope(
      reply([
        { key: 'HDR-1', brief: '   ' },
        { key: 'HDR-2', brief: '  keep this  ' },
        { key: 'HDR-2', brief: 'duplicate' },
      ]),
    )
    expect(parseRouteResult(run, offered('HDR-1', 'HDR-2'))).toEqual({
      ok: true,
      matches: [{ key: 'HDR-2', brief: 'keep this' }],
    })
  })

  it('returns an empty match list when the reply has no ticket blocks', () => {
    expect(parseRouteResult(envelope('nothing here'), offered('HDR-1'))).toEqual({
      ok: true,
      matches: [],
    })
    expect(parseRouteResult(envelope(''), offered('HDR-1'))).toEqual({ ok: true, matches: [] })
  })

  it('fails on a spawn error', () => {
    const result = parseRouteResult(
      { status: null, stdout: '', stderr: '', error: new Error('ENOENT claude') },
      offered('HDR-1'),
    )
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error.message).toMatch(/ENOENT claude/u)
  })

  it('fails on a non-zero exit, surfacing stderr', () => {
    const result = parseRouteResult(
      { status: 1, stdout: '', stderr: 'not logged in' },
      offered('HDR-1'),
    )
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error.message).toMatch(/not logged in/u)
  })

  it('fails when the CLI reports is_error', () => {
    const result = parseRouteResult(
      { status: 0, stdout: JSON.stringify({ is_error: true, result: 'boom' }), stderr: '' },
      offered('HDR-1'),
    )
    expect(result).toMatchObject({ ok: false })
  })
})

describe('runRoute', () => {
  it('passes the built args and prompt to the runner and filters by offered keys', async () => {
    let seenArgs: readonly string[] = []
    let seenStdin = ''
    const run: RunClaude = (args, stdin) => {
      seenArgs = args
      seenStdin = stdin
      return Promise.resolve(
        envelope(
          reply([
            { key: 'HDR-1', brief: 'b' },
            { key: 'HDR-off', brief: 'x' },
          ]),
        ),
      )
    }
    const result = await runRoute(
      { transcript: 't', tickets: [ticket('HDR-1')], skillBody: 'SKILL' },
      run,
    )
    expect(result).toEqual({ ok: true, matches: [{ key: 'HDR-1', brief: 'b' }] })
    expect(seenArgs[seenArgs.indexOf('--append-system-prompt') + 1]).toBe('SKILL')
    expect(seenStdin).toContain('## TRANSCRIPT')
  })
})
