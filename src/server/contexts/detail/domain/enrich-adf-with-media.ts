import type { AdfNode } from '../../../gateways/jira/types'

const PROXY_PATH_PREFIX = '/api/jira-media/'

export type AttachmentRef = {
  readonly attachmentId: string
  readonly mimeType: string
}

export function enrichAdfWithMedia(
  adf: AdfNode | null,
  attachmentByFilename: ReadonlyMap<string, AttachmentRef>,
): AdfNode | null {
  if (adf === null) return null
  if (attachmentByFilename.size === 0) return adf
  return walk(adf, attachmentByFilename)
}

export function collectMediaFilenames(adf: AdfNode | null): readonly string[] {
  if (adf === null) return []
  const filenames: string[] = []
  collect(adf, filenames)
  return filenames
}

function walk(node: AdfNode, attachmentByFilename: ReadonlyMap<string, AttachmentRef>): AdfNode {
  if (node.type === 'media') {
    const filename = typeof node.attrs?.alt === 'string' ? node.attrs.alt : null
    if (filename !== null) {
      const attachment = attachmentByFilename.get(filename)
      if (attachment !== undefined) {
        return {
          ...node,
          attrs: {
            ...node.attrs,
            url: `${PROXY_PATH_PREFIX}${attachment.attachmentId}`,
            mimeType: attachment.mimeType,
          },
        }
      }
    }
    return node
  }
  if (Array.isArray(node.content) && node.content.length > 0) {
    return {
      ...node,
      content: node.content.map((child) => walk(child, attachmentByFilename)),
    }
  }
  return node
}

function collect(node: AdfNode, into: string[]): void {
  if (node.type === 'media') {
    const filename = typeof node.attrs?.alt === 'string' ? node.attrs.alt : null
    if (filename !== null) into.push(filename)
    return
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collect(child, into)
  }
}
