import { describe, expect, it } from 'vitest'
import { assertIssueKey, quoteJqlString } from './jql'

describe('quoteJqlString', () => {
  const cases: ReadonlyArray<{ name: string; input: string; expected: string }> = [
    { name: 'empty string', input: '', expected: '""' },
    { name: 'plain identifier', input: 'HDR-1', expected: '"HDR-1"' },
    { name: 'embedded double-quote', input: 'a"b', expected: '"a\\"b"' },
    { name: 'embedded backslash', input: 'a\\b', expected: '"a\\\\b"' },
    { name: 'both backslash and double-quote', input: 'a"b\\c', expected: '"a\\"b\\\\c"' },
  ]

  for (const c of cases) {
    it(`quotes ${c.name}`, () => {
      expect(quoteJqlString(c.input)).toBe(c.expected)
    })
  }

  it('escapes backslash before double-quote (so \\" round-trips correctly)', () => {
    // Order matters: a literal `\` must be escaped first, otherwise the `\`
    // we insert to escape `"` would itself get re-escaped.
    expect(quoteJqlString('\\"')).toBe('"\\\\\\""')
  })
})

describe('assertIssueKey', () => {
  const accepted: ReadonlyArray<string> = ['HDR-1', 'HDR42-9999', 'AB-1', 'PROJ123-42']

  for (const value of accepted) {
    it(`accepts ${value} and returns it unchanged`, () => {
      expect(assertIssueKey(value, 'test')).toBe(value)
    })
  }

  const rejected: ReadonlyArray<{ name: string; input: string }> = [
    { name: 'empty string', input: '' },
    { name: 'lowercase prefix', input: 'hdr-1' },
    { name: 'mixed-case prefix', input: 'Hdr-1' },
    { name: 'leading-zero number', input: 'HDR-0' },
    { name: 'leading-zero multi-digit number', input: 'HDR-01' },
    { name: 'no number', input: 'HDR-' },
    { name: 'no hyphen', input: 'HDR1' },
    { name: 'single-letter prefix', input: 'H-1' },
    { name: 'leading whitespace', input: ' HDR-1' },
    { name: 'trailing whitespace', input: 'HDR-1 ' },
    { name: 'embedded whitespace', input: 'HDR -1' },
    { name: 'digit-led prefix', input: '1HDR-1' },
    { name: 'JQL injection attempt', input: 'HDR-1" OR project = OTHER --' },
  ]

  for (const c of rejected) {
    it(`rejects ${c.name} (${JSON.stringify(c.input)})`, () => {
      expect(() => assertIssueKey(c.input, 'test')).toThrow(`test: invalid issue key "${c.input}"`)
    })
  }
})
