// One file's diff, as a move page's whole-diff expander needs it (ADR-0010 §6).
//
// This is the **curation escape hatch**. A report's `diff` cells are the hunks
// the agent chose, with a sentence over each one — which is the right default and
// is also a judgement the reader must be able to check. So a move page can ask
// for the merge request's real diff and see the files the move's `paths` name.
//
// It is deliberately not part of the report: the diff is a **live read**, so it
// describes the merge request now rather than the commit the report was written
// against, and persisting it would make every record large and every report a
// diff viewer by default — the thing ADR-0009 says this surface is not.
//
// Pure mapping, no I/O: the gateway fetches, this names what came back.

import type { RawMrDiff } from '../gateways/gitlab/types'

/** What happened to the file. Named rather than inferred from three booleans. */
export type ExplainDiffStatus = 'added' | 'modified' | 'removed' | 'renamed'

export type ExplainDiffFile = {
  /** The path as it is *after* the change — what a move's `paths` names. */
  readonly path: string
  /** Where it came from, on a rename. `null` otherwise. */
  readonly previousPath: string | null
  readonly status: ExplainDiffStatus
  /** Hint for the highlighter, guessed from the extension; `null` when unknown. */
  readonly language: string | null
  /** Unified diff text, exactly as GitLab returned it. */
  readonly diff: string
}

// Shiki grammar names, keyed by extension. Only the languages
// `design-system/code-highlight` can actually load are worth guessing — a name
// it cannot resolve renders as plain text, which is the same outcome as `null`
// but costs a round trip to find out.
const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  cs: 'csharp',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  h: 'cpp',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  sh: 'bash',
  bash: 'bash',
  zsh: 'shell',
  md: 'markdown',
  mdx: 'markdown',
}

/** `src/pricing/quote.ts` → `typescript`. `null` for anything unmapped. */
export function languageForPath(path: string): string | null {
  const base = path.slice(path.lastIndexOf('/') + 1)
  // A dotfile with no second dot (`.gitignore`) has no extension to read.
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return base.toLowerCase() === 'dockerfile' ? 'dockerfile' : null
  return LANGUAGE_BY_EXTENSION[base.slice(dot + 1).toLowerCase()] ?? null
}

function statusOf(raw: RawMrDiff): ExplainDiffStatus {
  // Order matters: GitLab sets `renamed_file` alongside neither of the others,
  // but a file can be both new and renamed in a chain, and "renamed" is the more
  // useful thing to say when it is.
  if (raw.renamedFile) return 'renamed'
  if (raw.newFile) return 'added'
  if (raw.deletedFile) return 'removed'
  return 'modified'
}

/**
 * A deleted file has no path after the change, so its `oldPath` is the only one
 * it has — and it is also the path a move written against the pre-change tree
 * would name it by.
 */
function pathOf(raw: RawMrDiff): string {
  return raw.deletedFile ? raw.oldPath : raw.newPath
}

export function explainDiffFile(raw: RawMrDiff): ExplainDiffFile {
  const path = pathOf(raw)
  return {
    path,
    previousPath: raw.renamedFile && raw.oldPath !== path ? raw.oldPath : null,
    status: statusOf(raw),
    language: languageForPath(path),
    diff: raw.diff,
  }
}

/**
 * Every file in the merge request, sorted by path.
 *
 * Sorted here rather than in the view because it is the same answer every time
 * and GitLab's own order is an implementation detail of its pagination. Files
 * with an empty diff — GitLab returns those for a binary or a
 * collapsed-too-large file — are kept: "this file changed and the diff is not
 * showable" is information, and the renderer says so rather than the list
 * pretending the file is untouched.
 */
export function explainDiffFiles(raw: readonly RawMrDiff[]): readonly ExplainDiffFile[] {
  return raw.map(explainDiffFile).toSorted((a, b) => a.path.localeCompare(b.path))
}
