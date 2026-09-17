import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAG_COLOR_ID,
  TAG_COLORS,
  resolveTagColor,
  resolveTicketTags,
  type TagsState,
} from './tags'

describe('TAG_COLORS palette', () => {
  it('has 20 colours with unique ids', () => {
    expect(TAG_COLORS).toHaveLength(20)
    expect(new Set(TAG_COLORS.map((c) => c.id)).size).toBe(20)
  })

  it('leads with the critical bright-red-on-white combination', () => {
    const first = TAG_COLORS[0]
    expect(first?.id).toBe('critical')
    expect(first?.swatchBg.toLowerCase()).toBe('#ffffff')
    expect(first?.swatchFg.toLowerCase()).toBe('#dc2626')
  })

  it('exposes the default colour id', () => {
    expect(TAG_COLORS.some((c) => c.id === DEFAULT_TAG_COLOR_ID)).toBe(true)
  })
})

describe('resolveTagColor', () => {
  it('resolves a known id', () => {
    expect(resolveTagColor('critical').name).toBe('Critical')
  })

  it('falls back to the default for an unknown id', () => {
    expect(resolveTagColor('made-up').swatchBg).toBe(resolveTagColor(DEFAULT_TAG_COLOR_ID).swatchBg)
  })
})

describe('resolveTicketTags', () => {
  const state: TagsState = {
    definitions: [
      { id: 'a', name: 'Alpha', colorId: 'red' },
      { id: 'b', name: 'Beta', colorId: 'blue' },
    ],
    attachments: { 'HDR-1': ['b', 'a'], 'HDR-2': ['ghost'] },
  }

  it('returns [] for a ticket with no attachments', () => {
    expect(resolveTicketTags(state, 'HDR-99')).toEqual([])
  })

  it('resolves attached ids to definitions in attachment order', () => {
    expect(resolveTicketTags(state, 'HDR-1').map((d) => d.id)).toEqual(['b', 'a'])
  })

  it('drops ids with no matching definition', () => {
    expect(resolveTicketTags(state, 'HDR-2')).toEqual([])
  })
})
