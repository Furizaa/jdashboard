import type { AdfNode } from '../gateways/jira/types'

// Flatten an ADF document to plain text for feeding to the refine agent. This is
// the server-side twin of the client's `contexts/detail/domain/extract-plain-text`
// (the server cannot import a client context): a note-refinement prompt only needs
// the readable words of the description and comments, not their ADF structure.
//
// Block-level nodes end a line so paragraphs and list items don't run together;
// hard breaks become newlines. Marks and attributes are ignored — the agent works
// from prose, not formatting.

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'bulletList',
  'orderedList',
  'codeBlock',
  'blockquote',
  'rule',
  'panel',
])

export function adfToText(doc: AdfNode | null | undefined): string {
  if (doc === null || doc === undefined) return ''
  const lines: string[] = []
  const buf: string[] = []

  const flush = () => {
    if (buf.length === 0) return
    lines.push(buf.join(''))
    buf.length = 0
  }

  const walk = (node: AdfNode) => {
    if (typeof node.text === 'string') buf.push(node.text)
    if (node.type === 'hardBreak') buf.push('\n')
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
    }
    if (node.type !== undefined && BLOCK_TYPES.has(node.type)) flush()
  }

  walk(doc)
  flush()
  return lines.join('\n').trim()
}
