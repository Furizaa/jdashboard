import { describe, expect, it } from 'vitest'
import type { RawMrDiff } from '../gateways/gitlab/types'
import { explainDiffFile, explainDiffFiles, languageForPath } from './mr-diff'

// Pure mapping, so this is call-and-assert over the shapes GitLab actually
// returns: a modification, an addition, a deletion, a rename, and the
// no-diff-to-show case a binary or collapsed file produces.

function raw(overrides: Partial<RawMrDiff> = {}): RawMrDiff {
  return {
    oldPath: 'src/pricing/quote.ts',
    newPath: 'src/pricing/quote.ts',
    newFile: false,
    renamedFile: false,
    deletedFile: false,
    diff: '@@ -1 +1 @@\n-a\n+b',
    ...overrides,
  }
}

describe('languageForPath', () => {
  it.each([
    ['src/pricing/quote.ts', 'typescript'],
    ['src/App.tsx', 'tsx'],
    ['scripts/build.mjs', 'javascript'],
    ['infra/main.py', 'python'],
    ['config/app.yml', 'yaml'],
    ['README.md', 'markdown'],
    ['Dockerfile', 'dockerfile'],
  ])('reads %s as %s', (path, expected) => {
    expect(languageForPath(path)).toBe(expected)
  })

  it.each([
    ['a dotfile with no extension', '.gitignore'],
    ['an extension we have no grammar for', 'src/thing.weird'],
    ['a bare name', 'LICENSE'],
  ])('is null for %s — plain text is the fallback', (_name, path) => {
    expect(languageForPath(path)).toBeNull()
  })

  it('ignores case in the extension', () => {
    expect(languageForPath('src/Thing.TS')).toBe('typescript')
  })
})

describe('explainDiffFile', () => {
  it('names a modification', () => {
    expect(explainDiffFile(raw())).toEqual({
      path: 'src/pricing/quote.ts',
      previousPath: null,
      status: 'modified',
      language: 'typescript',
      diff: '@@ -1 +1 @@\n-a\n+b',
    })
  })

  it('names an addition', () => {
    expect(explainDiffFile(raw({ newFile: true }))).toMatchObject({ status: 'added' })
  })

  it('names a deletion by the path it had — the only one it has', () => {
    const file = explainDiffFile(
      raw({ deletedFile: true, oldPath: 'src/legacy/round.ts', newPath: 'src/legacy/round.ts' }),
    )
    expect(file).toMatchObject({ status: 'removed', path: 'src/legacy/round.ts' })
  })

  it('names a rename and keeps where it came from', () => {
    const file = explainDiffFile(
      raw({ renamedFile: true, oldPath: 'src/old/quote.ts', newPath: 'src/pricing/quote.ts' }),
    )
    expect(file).toMatchObject({
      status: 'renamed',
      path: 'src/pricing/quote.ts',
      previousPath: 'src/old/quote.ts',
    })
  })

  it('calls a file both new and renamed a rename, which is the useful half', () => {
    expect(explainDiffFile(raw({ newFile: true, renamedFile: true }))).toMatchObject({
      status: 'renamed',
    })
  })

  it('keeps a file whose diff GitLab would not give us', () => {
    // Binary, or collapsed as too large. "This changed and the diff is not
    // showable" is information; dropping it would say the file is untouched.
    expect(explainDiffFile(raw({ diff: '' }))).toMatchObject({ diff: '' })
  })
})

describe('explainDiffFiles', () => {
  it('sorts by path, so the list is the same answer every time', () => {
    const files = explainDiffFiles([
      raw({ newPath: 'src/z.ts', oldPath: 'src/z.ts' }),
      raw({ newPath: 'src/a.ts', oldPath: 'src/a.ts' }),
    ])
    expect(files.map((file) => file.path)).toEqual(['src/a.ts', 'src/z.ts'])
  })

  it('maps an empty diff list to an empty file list', () => {
    expect(explainDiffFiles([])).toEqual([])
  })
})
