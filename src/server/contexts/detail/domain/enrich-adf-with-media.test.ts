import { describe, expect, it } from 'vitest'
import type { AdfNode } from '../../../gateways/jira/types'
import {
  type AttachmentRef,
  collectMediaFilenames,
  enrichAdfWithMedia,
} from './enrich-adf-with-media'

function map(
  ...entries: ReadonlyArray<readonly [string, AttachmentRef]>
): ReadonlyMap<string, AttachmentRef> {
  return new Map(entries)
}

const PNG_REF: AttachmentRef = { attachmentId: '10001', mimeType: 'image/png' }
const VIDEO_REF: AttachmentRef = { attachmentId: '10002', mimeType: 'video/mp4' }

describe('enrichAdfWithMedia', () => {
  it('returns null for null ADF', () => {
    expect(enrichAdfWithMedia(null, map(['pic.png', PNG_REF]))).toBeNull()
  })

  it('returns the input unchanged when the attachment map is empty', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [{ type: 'media', attrs: { id: 'uuid', alt: 'pic.png' } }],
    }
    const out = enrichAdfWithMedia(adf, map())
    expect(out).toBe(adf)
  })

  it('enriches a top-level media node whose alt filename is in the map', () => {
    const adf: AdfNode = { type: 'media', attrs: { id: 'uuid-a', alt: 'pic.png' } }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    expect(out).toEqual({
      type: 'media',
      attrs: {
        id: 'uuid-a',
        alt: 'pic.png',
        url: '/api/jira-media/10001',
        mimeType: 'image/png',
      },
    })
  })

  it('preserves existing attrs (id, width, height) and adds url + mimeType', () => {
    const adf: AdfNode = {
      type: 'media',
      attrs: { id: 'uuid-a', alt: 'pic.png', width: 200, height: 100 },
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    expect(out).toEqual({
      type: 'media',
      attrs: {
        id: 'uuid-a',
        alt: 'pic.png',
        width: 200,
        height: 100,
        url: '/api/jira-media/10001',
        mimeType: 'image/png',
      },
    })
  })

  it('leaves a media node with a filename missing from the map unchanged', () => {
    const adf: AdfNode = { type: 'media', attrs: { id: 'uuid-x', alt: 'unknown.png' } }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    expect(out).toEqual({ type: 'media', attrs: { id: 'uuid-x', alt: 'unknown.png' } })
  })

  it('leaves a media node with no alt attribute unchanged', () => {
    const adf: AdfNode = { type: 'media', attrs: { id: 'uuid-x' } }
    expect(enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))).toEqual(adf)
  })

  it('leaves a media node with non-string alt unchanged', () => {
    const adf: AdfNode = { type: 'media', attrs: { id: 'uuid-x', alt: null } }
    expect(enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))).toEqual(adf)
  })

  it('walks media inside paragraphs', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'media', attrs: { id: 'u', alt: 'pic.png' } }] },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    expect(out).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'media',
              attrs: {
                id: 'u',
                alt: 'pic.png',
                url: '/api/jira-media/10001',
                mimeType: 'image/png',
              },
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
              content: [{ type: 'media', attrs: { id: 'u', alt: 'pic.png' } }],
            },
          ],
        },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    const item = (out as AdfNode).content?.[0]?.content?.[0]?.content?.[0]
    expect(item?.attrs?.url).toBe('/api/jira-media/10001')
  })

  it('walks media inside blockquote', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'blockquote', content: [{ type: 'media', attrs: { id: 'u', alt: 'pic.png' } }] },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    const m = (out as AdfNode).content?.[0]?.content?.[0]
    expect(m?.attrs?.url).toBe('/api/jira-media/10001')
  })

  it('walks media inside panel', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        {
          type: 'panel',
          attrs: { panelType: 'info' },
          content: [{ type: 'media', attrs: { id: 'u', alt: 'pic.png' } }],
        },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    const m = (out as AdfNode).content?.[0]?.content?.[0]
    expect(m?.attrs?.url).toBe('/api/jira-media/10001')
  })

  it('walks media inside mediaSingle', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        {
          type: 'mediaSingle',
          content: [{ type: 'media', attrs: { id: 'u', alt: 'pic.png' } }],
        },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    const m = (out as AdfNode).content?.[0]?.content?.[0]
    expect(m?.attrs?.url).toBe('/api/jira-media/10001')
  })

  it('walks media inside mediaGroup', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        {
          type: 'mediaGroup',
          content: [
            { type: 'media', attrs: { id: 'u-a', alt: 'pic.png' } },
            { type: 'media', attrs: { id: 'u-b', alt: 'clip.mp4' } },
          ],
        },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF], ['clip.mp4', VIDEO_REF]))
    const group = (out as AdfNode).content?.[0]
    expect(group?.content?.[0]?.attrs?.mimeType).toBe('image/png')
    expect(group?.content?.[0]?.attrs?.url).toBe('/api/jira-media/10001')
    expect(group?.content?.[1]?.attrs?.mimeType).toBe('video/mp4')
    expect(group?.content?.[1]?.attrs?.url).toBe('/api/jira-media/10002')
  })

  it('does not modify non-media nodes', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'h' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'p' }] },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    expect(out).toEqual(adf)
  })

  it('does not mutate the input ADF', () => {
    const original: AdfNode = {
      type: 'doc',
      content: [{ type: 'media', attrs: { id: 'u', alt: 'pic.png' } }],
    }
    const snapshot = JSON.parse(JSON.stringify(original)) as AdfNode
    enrichAdfWithMedia(original, map(['pic.png', PNG_REF]))
    expect(original).toEqual(snapshot)
  })

  it('handles a partial-success map: known filenames enriched, unknown filenames passed through', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'media', attrs: { id: 'u-1', alt: 'pic.png' } },
        { type: 'media', attrs: { id: 'u-2', alt: 'unknown.png' } },
      ],
    }
    const out = enrichAdfWithMedia(adf, map(['pic.png', PNG_REF]))
    expect((out as AdfNode).content?.[0]?.attrs?.url).toBe('/api/jira-media/10001')
    expect((out as AdfNode).content?.[1]?.attrs?.url).toBeUndefined()
  })
})

describe('collectMediaFilenames', () => {
  it('returns an empty array for null', () => {
    expect(collectMediaFilenames(null)).toEqual([])
  })

  it('returns an empty array for ADF with no media', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    }
    expect(collectMediaFilenames(adf)).toEqual([])
  })

  it('collects filenames from top-level and nested media nodes in document order', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'media', attrs: { id: 'u-a', alt: 'a.png' } },
        { type: 'paragraph', content: [{ type: 'media', attrs: { id: 'u-b', alt: 'b.png' } }] },
        { type: 'mediaGroup', content: [{ type: 'media', attrs: { id: 'u-c', alt: 'c.png' } }] },
      ],
    }
    expect(collectMediaFilenames(adf)).toEqual(['a.png', 'b.png', 'c.png'])
  })

  it('skips media nodes without an alt attribute', () => {
    const adf: AdfNode = {
      type: 'doc',
      content: [
        { type: 'media', attrs: { id: 'u-x' } },
        { type: 'media', attrs: { id: 'u-a', alt: 'a.png' } },
      ],
    }
    expect(collectMediaFilenames(adf)).toEqual(['a.png'])
  })
})
