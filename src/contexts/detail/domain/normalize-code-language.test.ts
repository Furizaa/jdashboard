import { describe, expect, it } from 'vitest'
import { normalizeCodeLanguage } from './normalize-code-language'

const CANONICAL: ReadonlyArray<string> = [
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'csharp',
  'cpp',
  'sql',
  'json',
  'yaml',
  'xml',
  'html',
  'css',
  'bash',
  'shell',
  'markdown',
  'dockerfile',
]

const ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['js', 'javascript'],
  ['ts', 'typescript'],
  ['py', 'python'],
  ['python3', 'python'],
  ['golang', 'go'],
  ['rs', 'rust'],
  ['kt', 'kotlin'],
  ['cs', 'csharp'],
  ['c#', 'csharp'],
  ['c++', 'cpp'],
  ['cxx', 'cpp'],
  ['cc', 'cpp'],
  ['sh', 'bash'],
  ['zsh', 'bash'],
  ['yml', 'yaml'],
  ['htm', 'html'],
  ['md', 'markdown'],
  ['docker', 'dockerfile'],
]

describe('normalizeCodeLanguage', () => {
  describe('canonical names', () => {
    it.each(CANONICAL)('recognises %s as itself', (lang) => {
      expect(normalizeCodeLanguage(lang)).toBe(lang)
    })
  })

  describe('aliases', () => {
    it.each(ALIASES)('maps %s to %s', (alias, canonical) => {
      expect(normalizeCodeLanguage(alias)).toBe(canonical)
    })
  })

  describe('case normalisation', () => {
    it('lowercases canonical input', () => {
      expect(normalizeCodeLanguage('TypeScript')).toBe('typescript')
    })

    it('lowercases alias input', () => {
      expect(normalizeCodeLanguage('JS')).toBe('javascript')
    })

    it('lowercases mixed-case alias with punctuation', () => {
      expect(normalizeCodeLanguage('C++')).toBe('cpp')
    })
  })

  describe('whitespace', () => {
    it('trims surrounding whitespace', () => {
      expect(normalizeCodeLanguage('  python  ')).toBe('python')
    })
  })

  describe('null / empty / unknown', () => {
    it('returns null for null', () => {
      expect(normalizeCodeLanguage(null)).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(normalizeCodeLanguage(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(normalizeCodeLanguage('')).toBeNull()
    })

    it('returns null for whitespace-only input', () => {
      expect(normalizeCodeLanguage('   ')).toBeNull()
    })

    it('returns null for an unrecognised language', () => {
      expect(normalizeCodeLanguage('gobbledygook')).toBeNull()
    })

    it('returns null for a language outside the Phase-1 allowlist', () => {
      expect(normalizeCodeLanguage('haskell')).toBeNull()
    })
  })
})
