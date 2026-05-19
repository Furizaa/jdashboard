import { describe, expect, it } from 'vitest'
import { branchSlug } from './branch-slug'

describe('branchSlug', () => {
  it('uses fix/ prefix for Bug', () => {
    expect(branchSlug({ issueKey: 'GEO-123', typeName: 'Bug', title: 'Map crash on zoom' })).toBe(
      'fix/GEO-123-map-crash-on-zoom',
    )
  })

  it('uses feat/ prefix for Story', () => {
    expect(branchSlug({ issueKey: 'GEO-200', typeName: 'Story', title: 'Add layer toggle' })).toBe(
      'feat/GEO-200-add-layer-toggle',
    )
  })

  it('uses feat/ prefix for Task', () => {
    expect(branchSlug({ issueKey: 'GEO-9', typeName: 'Task', title: 'Tidy logs' })).toBe(
      'feat/GEO-9-tidy-logs',
    )
  })

  it('uses feat/ prefix for any non-Bug type (case sensitive)', () => {
    expect(branchSlug({ issueKey: 'GEO-1', typeName: 'bug', title: 'Lowercase trap' })).toBe(
      'feat/GEO-1-lowercase-trap',
    )
  })

  it('lowercases, strips special chars, collapses spaces to single hyphens', () => {
    expect(
      branchSlug({
        issueKey: 'GEO-7',
        typeName: 'Story',
        title: '  Hello, World!! Multiple   spaces  ',
      }),
    ).toBe('feat/GEO-7-hello-world-multiple-spaces')
  })

  it('truncates the title slug to ~40 chars', () => {
    const long = 'this is a very long title that should definitely exceed forty characters of slug'
    const result = branchSlug({ issueKey: 'GEO-42', typeName: 'Story', title: long })
    const titleSlug = result.split('GEO-42-')[1] ?? ''
    expect(titleSlug.length).toBeLessThanOrEqual(40)
    expect(result.startsWith('feat/GEO-42-')).toBe(true)
  })

  it('handles an empty title by omitting the slug tail', () => {
    expect(branchSlug({ issueKey: 'GEO-3', typeName: 'Story', title: '' })).toBe('feat/GEO-3')
  })

  it('handles a title with only special chars by omitting the slug tail', () => {
    expect(branchSlug({ issueKey: 'GEO-4', typeName: 'Bug', title: '!!! ???' })).toBe('fix/GEO-4')
  })

  it('does not leave trailing hyphens after truncation', () => {
    // truncation at index 40 would land on a hyphen
    const title = `${'a'.repeat(39)}-bbb`
    const result = branchSlug({ issueKey: 'GEO-1', typeName: 'Story', title })
    expect(result).not.toMatch(/-$/u)
  })
})
