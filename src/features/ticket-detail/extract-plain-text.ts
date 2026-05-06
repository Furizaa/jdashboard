import type { AdfNode } from '~/server/jira'

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

export function extractPlainText(doc: AdfNode | null): string {
  if (doc === null) return ''
  const lines: string[] = []
  const buf: string[] = []

  const flush = () => {
    if (buf.length === 0) return
    lines.push(buf.join(''))
    buf.length = 0
  }

  const walk = (node: AdfNode) => {
    if (typeof node.text === 'string') {
      buf.push(node.text)
    }
    if (node.type === 'hardBreak') {
      buf.push('\n')
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
    }
    if (node.type !== undefined && BLOCK_TYPES.has(node.type)) {
      flush()
    }
  }

  walk(doc)
  flush()
  return lines.join('\n').trim()
}
