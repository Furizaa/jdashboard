import { describe, expect, it } from 'vitest'
import type { AdfNode, MediaMetadata } from '../../../gateways/jira/types'
import { collectMediaIds, enrichAdfWithMedia } from './enrich-adf-with-media'

function map(
  ...entries: ReadonlyArray<readonly [string, MediaMetadata]>
): ReadonlyMap<string, MediaMetadata> {
  return new Map(entries)
}

const META_PNG: MediaMetadata = { id: 'a', mimeType: 'image/png', width: 100, height: 50 }
const META_VIDEO: MediaMetadata = { id: 'b', mimeType: 'video/mp4' }

describe('enrichAdfWithMedia', () => {
  it('returns null for null ADF', () => {
    expect(enrichAdfWithMedia(null, map(['a', META_PNG]))).toBeNull()
  })

  it('returns the input unchanged when the metadata map is empty', () => {
    const adf: AdfNode = { type: 'doc', content: [{ type: 'media', attrs: { id: 'a' } }] }
    const out = enrichAdfWithMedia(adf, map())
    expect(out).toBe(adf)
  })

  it('enriches a top-level media node whose id is in the map', () => {
    const adf: AdfNode = { type: 'media', attrs: { id: 'a' } }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    expect(out).toEqual({
      type: 'media',
      attrs: { id: 'a', url: '/api/jira-media/a', mimeType: 'image/png' },
    })
  })

  it('preserves existing attrs (alt, width, height) and adds url + mimeType', () => {
    const adf: AdfNode = {
      type: 'media',
      attrs: { id: 'a', alt: 'screenshot', width: 200, height: 100 },
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    expect(out).toEqual({
      type: 'media',
      attrs: {
        id: 'a',
        alt: 'screenshot',
        width: 200,
        height: 100,
        url: '/api/jira-media/a',
        mimeType: 'image/png',
      },
    })
  })

  it('leaves a media node with an id missing from the map unchanged', () => {
    const adf: AdfNode = { type: 'media', attrs: { id: 'unresolved' } }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    expect(out).toEqual({ type: 'media', attrs: { id: 'unresolved' } })
  })

  it('walks media inside paragraphs', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'media', attrs: { id: 'a' } }] }],
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    expect(out).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'media',
              attrs: { id: 'a', url: '/api/jira-media/a', mimeType: 'image/png' },
            },
          ],
        },
      ],
    })
  })

  it('walks media inside bulletList / listItem', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'media', attrs: { id: 'a' } }],
            },
          ],
        },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    const item = (out as AdfNode).content?.[0]?.content?.[0]?.content?.[0]
    expect(item?.attrs?.url).toBe('/api/jira-media/a')
  })

  it('walks media inside blockquote', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'media', attrs: { id: 'a' } }] }],
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    const m = (out as AdfNode).content?.[0]?.content?.[0]
    expect(m?.attrs?.url).toBe('/api/jira-media/a')
  })

  it('walks media inside panel', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        {
          type: 'panel',
          attrs: { panelType: 'info' },
          content: [{ type: 'media', attrs: { id: 'a' } }],
        },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    const m = (out as AdfNode).content?.[0]?.content?.[0]
    expect(m?.attrs?.url).toBe('/api/jira-media/a')
  })

  it('walks media inside mediaSingle', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [{ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'a' } }] }],
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    const m = (out as AdfNode).content?.[0]?.content?.[0]
    expect(m?.attrs?.url).toBe('/api/jira-media/a')
  })

  it('walks media inside mediaGroup', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        {
          type: 'mediaGroup',
          content: [
            { type: 'media', attrs: { id: 'a' } },
            { type: 'media', attrs: { id: 'b' } },
          ],
        },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG], ['b', META_VIDEO]))
    const group = (out as AdfNode).content?.[0]
    expect(group?.content?.[0]?.attrs?.mimeType).toBe('image/png')
    expect(group?.content?.[1]?.attrs?.mimeType).toBe('video/mp4')
  })

  it('does not modify non-media nodes', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'h' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'p' }] },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    expect(out).toEqual(adf)
  })

  it('does not mutate the input ADF', () => {
    const original: AdfNode = {
      type: 'doc',
      content: [{ type: 'media', attrs: { id: 'a' } }],
    }
    const snapshot = JSON.parse(JSON.stringify(original)) as AdfNode
    enrichAdfWithMedia(original, map(['a', META_PNG]))
    expect(original).toEqual(snapshot)
  })

  it('leaves a media node with no id attribute unchanged', () => {
    const adf: AdfNode = { type: 'media', attrs: { alt: 'no-id' } }
    expect(enrichAdfWithMedia(adf, map(['a', META_PNG]))).toEqual(adf)
  })

  it('handles a partial-success map: known ids enriched, unknown ids passed through', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'media', attrs: { id: 'a' } },
        { type: 'media', attrs: { id: 'unknown' } },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['a', META_PNG]))
    expect((out as AdfNode).content?.[0]?.attrs?.url).toBe('/api/jira-media/a')
    expect((out as AdfNode).content?.[1]?.attrs?.url).toBeUndefined()
  })
})

describe('collectMediaIds', () => {
  it('returns an empty array for null', () => {
    expect(collectMediaIds(null)).toEqual([])
  })

  it('returns an empty array for ADF with no media', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    }
    expect(collectMediaIds(adf)).toEqual([])
  })

  it('collects ids from top-level and nested media nodes in document order', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'media', attrs: { id: 'a' } },
        { type: 'paragraph', content: [{ type: 'media', attrs: { id: 'b' } }] },
        { type: 'mediaGroup', content: [{ type: 'media', attrs: { id: 'c' } }] },
      ],
    }
    expect(collectMediaIds(adf)).toEqual(['a', 'b', 'c'])
  })

  it('skips media nodes without an id attribute', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'media', attrs: { alt: 'no-id' } },
        { type: 'media', attrs: { id: 'a' } },
      ],
    }
    expect(collectMediaIds(adf)).toEqual(['a'])
  })
})
