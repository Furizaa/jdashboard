import type { AdfNode } from '../../../gateways/jira/types'

export function plainTextToAdf(text: string): AdfNode {
  const lines = text.split('\n')
  const content: AdfNode[] = lines.map((line) =>
    line.length === 0
      ? { type: 'paragraph' }
      : { type: 'paragraph', content: [{ type: 'text', text: line }] },
  )
  return { type: 'doc', version: 1, content }
}
