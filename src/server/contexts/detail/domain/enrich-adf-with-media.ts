import type { AdfNode, MediaMetadata } from '../../../gateways/jira/types'

const PROXY_PATH_PREFIX = '/api/jira-media/'

export function enrichAdfWithMedia(
  adf: AdfNode | null,
  mediaUrlMap: ReadonlyMap<string, MediaMetadata>,
): AdfNode | null {
  if (adf === null) return null
  if (mediaUrlMap.size === 0) return adf
  return walk(adf, mediaUrlMap)
}

export function collectMediaIds(adf: AdfNode | null): readonly string[] {
  if (adf === null) return []
  const ids: string[] = []
  collect(adf, ids)
  return ids
}

function walk(node: AdfNode, mediaUrlMap: ReadonlyMap<string, MediaMetadata>): AdfNode {
  if (node.type === 'media') {
    const id = typeof node.attrs?.id === 'string' ? node.attrs.id : null
    if (id !== null) {
      const metadata = mediaUrlMap.get(id)
      if (metadata !== undefined) {
        return {
          ...node,
          attrs: {
            ...node.attrs,
            url: `${PROXY_PATH_PREFIX}${id}`,
            mimeType: metadata.mimeType,
          },
        }
      }
    }
    return node
  }
  if (Array.isArray(node.content) && node.content.length > 0) {
    return {
      ...node,
      content: node.content.map((child) => walk(child, mediaUrlMap)),
    }
  }
  return node
}

function collect(node: AdfNode, into: string[]): void {
  if (node.type === 'media') {
    const id = typeof node.attrs?.id === 'string' ? node.attrs.id : null
    if (id !== null) into.push(id)
    return
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collect(child, into)
  }
}
