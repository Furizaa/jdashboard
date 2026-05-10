import { describe, expect, it } from 'vitest'
import { parseInlineCard, type InlineCardKind } from './parse-inline-card'

const BASE = 'https://hexagon.atlassian.net'

describe('parseInlineCard', () => {
  describe('JiraIssue detection', () => {
    it.each([
      [`${BASE}/browse/HDR-447`, 'HDR-447'],
      [`${BASE}/browse/AB-1`, 'AB-1'],
      [`${BASE}/browse/HDR-447#comment-1`, 'HDR-447'],
      [`${BASE}/browse/HDR-447?focusedCommentId=99`, 'HDR-447'],
    ])('matches %s as JiraIssue %s', (url, issueKey) => {
      const result = parseInlineCard(url, BASE)
      expect(result).toEqual<InlineCardKind>({ _tag: 'JiraIssue', issueKey, url })
    })

    it('matches case-insensitively on host', () => {
      const result = parseInlineCard(`https://HEXAGON.ATLASSIAN.NET/browse/HDR-1`, BASE)
      expect(result._tag).toBe('JiraIssue')
    })

    it('treats matching base URL non-browse path as PlainUrl', () => {
      const url = `${BASE}/wiki/spaces/HDR/pages/12345`
      const result = parseInlineCard(url, BASE)
      expect(result).toEqual<InlineCardKind>({
        _tag: 'PlainUrl',
        url,
        display: 'hexagon.atlassian.net/wiki/spaces/HDR/p…',
      })
    })

    it('treats matching base URL with /browse but no key as PlainUrl', () => {
      const url = `${BASE}/browse`
      const result = parseInlineCard(url, BASE)
      expect(result._tag).toBe('PlainUrl')
    })
  })

  describe('PlainUrl branch', () => {
    it('returns PlainUrl for non-Jira host', () => {
      const url = 'https://github.com/foo/bar/issues/1'
      const result = parseInlineCard(url, BASE)
      expect(result).toEqual<InlineCardKind>({
        _tag: 'PlainUrl',
        url,
        display: 'github.com/foo/bar/issues/1',
      })
    })

    it('returns PlainUrl for any URL when jiraBaseUrl is null', () => {
      const url = `${BASE}/browse/HDR-1`
      const result = parseInlineCard(url, null)
      expect(result._tag).toBe('PlainUrl')
    })

    it('returns PlainUrl for any URL when jiraBaseUrl is empty string', () => {
      const url = `${BASE}/browse/HDR-1`
      const result = parseInlineCard(url, '')
      expect(result._tag).toBe('PlainUrl')
    })

    it('returns PlainUrl with raw input when URL is malformed', () => {
      const url = 'not a url'
      const result = parseInlineCard(url, BASE)
      expect(result).toEqual<InlineCardKind>({ _tag: 'PlainUrl', url, display: url })
    })

    it('returns PlainUrl with raw input when URL is empty', () => {
      const result = parseInlineCard('', BASE)
      expect(result).toEqual<InlineCardKind>({ _tag: 'PlainUrl', url: '', display: '' })
    })

    it('strips trailing slash from display', () => {
      const result = parseInlineCard('https://example.com/', null)
      expect(result).toEqual<InlineCardKind>({
        _tag: 'PlainUrl',
        url: 'https://example.com/',
        display: 'example.com',
      })
    })

    it('strips trailing slash from longer paths', () => {
      const result = parseInlineCard('https://example.com/foo/', null)
      expect(result).toEqual<InlineCardKind>({
        _tag: 'PlainUrl',
        url: 'https://example.com/foo/',
        display: 'example.com/foo',
      })
    })

    it('display omits the https:// scheme', () => {
      const result = parseInlineCard('https://example.com/foo', null)
      const plain = result as Extract<InlineCardKind, { _tag: 'PlainUrl' }>
      expect(plain.display).not.toContain('https://')
      expect(plain.display).toBe('example.com/foo')
    })

    it('truncates long displays to 40 chars with tail ellipsis', () => {
      const url = 'https://very-long-host.example.com/some/very/long/path/segment'
      const result = parseInlineCard(url, null)
      expect(result._tag).toBe('PlainUrl')
      expect(result).toMatchObject({ _tag: 'PlainUrl', url })
      const plainResult = result as Extract<InlineCardKind, { _tag: 'PlainUrl' }>
      expect(plainResult.display.length).toBeLessThanOrEqual(40)
      expect(plainResult.display.endsWith('…')).toBe(true)
    })

    it('does not truncate displays exactly 40 chars long', () => {
      // host+path = exactly 40 chars
      const host = 'example.com'
      const path = '/' + 'a'.repeat(40 - host.length - 1)
      const url = `https://${host}${path}`
      const result = parseInlineCard(url, null)
      const plainResult = result as Extract<InlineCardKind, { _tag: 'PlainUrl' }>
      expect(plainResult.display).toBe(host + path)
      expect(plainResult.display.length).toBe(40)
      expect(plainResult.display.endsWith('…')).toBe(false)
    })
  })

  describe('jiraBaseUrl edge cases', () => {
    it('falls through to PlainUrl when jiraBaseUrl is malformed', () => {
      const result = parseInlineCard(`${BASE}/browse/HDR-1`, 'not a url')
      expect(result._tag).toBe('PlainUrl')
    })

    it('matches Jira issue when jiraBaseUrl has a trailing slash', () => {
      const result = parseInlineCard(`${BASE}/browse/HDR-1`, `${BASE}/`)
      expect(result._tag).toBe('JiraIssue')
    })
  })
})
