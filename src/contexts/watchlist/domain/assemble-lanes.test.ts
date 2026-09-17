import { describe, expect, it } from 'vitest'
import type { BoardIssue, TagDefinition, TagsState } from '~/kernel'
import { assembleLanes } from './assemble-lanes'

function issue(key: string, summary = key): BoardIssue {
  return { key, summary, statusName: 'In Implementation', typeName: 'Task', labels: [], epic: null }
}

const RED: TagDefinition = { id: 'red', name: 'Red', colorId: 'red' }
const BLUE: TagDefinition = { id: 'blue', name: 'Blue', colorId: 'blue' }
const GREEN: TagDefinition = { id: 'green', name: 'Green', colorId: 'green' }

function tagsState(attachments: Record<string, string[]>): TagsState {
  return { definitions: [RED, BLUE, GREEN], attachments }
}

describe('assembleLanes', () => {
  it('collects cards carrying ANY of a lane’s tags (union)', () => {
    const lanes = assembleLanes({
      cards: [issue('HDR-1'), issue('HDR-2'), issue('HDR-3')],
      tagsState: tagsState({ 'HDR-1': ['red'], 'HDR-2': ['blue'], 'HDR-3': ['green'] }),
      lanes: [{ id: 'warm', tagIds: ['red', 'blue'] }],
      searchQuery: '',
    })
    expect(lanes.map((l) => l.id)).toEqual(['warm'])
    expect(lanes[0]!.tags.map((t) => t.id)).toEqual(['red', 'blue'])
    expect(lanes[0]!.items.map((i) => i.key)).toEqual(['HDR-1', 'HDR-2'])
  })

  it('places a card once in a lane even if it carries two of the lane’s tags', () => {
    const lanes = assembleLanes({
      cards: [issue('HDR-1')],
      tagsState: tagsState({ 'HDR-1': ['red', 'blue'] }),
      lanes: [{ id: 'warm', tagIds: ['red', 'blue'] }],
      searchQuery: '',
    })
    expect(lanes[0]!.items.map((i) => i.key)).toEqual(['HDR-1'])
  })

  it('places a card in every lane it matches', () => {
    const lanes = assembleLanes({
      cards: [issue('HDR-1')],
      tagsState: tagsState({ 'HDR-1': ['red', 'green'] }),
      lanes: [
        { id: 'l-red', tagIds: ['red'] },
        { id: 'l-green', tagIds: ['green'] },
      ],
      searchQuery: '',
    })
    expect(lanes[0]!.items.map((i) => i.key)).toEqual(['HDR-1'])
    expect(lanes[1]!.items.map((i) => i.key)).toEqual(['HDR-1'])
  })

  it('drops cards with no tag matching any configured lane', () => {
    const lanes = assembleLanes({
      cards: [issue('HDR-1'), issue('HDR-9')],
      tagsState: tagsState({ 'HDR-1': ['red'] }),
      lanes: [{ id: 'l-red', tagIds: ['red'] }],
      searchQuery: '',
    })
    expect(lanes[0]!.items.map((i) => i.key)).toEqual(['HDR-1'])
  })

  it('preserves lane order and keeps an empty configured lane', () => {
    const lanes = assembleLanes({
      cards: [issue('HDR-1')],
      tagsState: tagsState({ 'HDR-1': ['red'] }),
      lanes: [
        { id: 'l-blue', tagIds: ['blue'] },
        { id: 'l-red', tagIds: ['red'] },
      ],
      searchQuery: '',
    })
    expect(lanes.map((l) => l.id)).toEqual(['l-blue', 'l-red'])
    expect(lanes[0]!.items).toEqual([])
  })

  it('drops deleted tags from a lane and skips a lane left with no live tags', () => {
    const lanes = assembleLanes({
      cards: [issue('HDR-1')],
      tagsState: tagsState({ 'HDR-1': ['red'] }),
      lanes: [
        { id: 'mixed', tagIds: ['red', 'ghost'] },
        { id: 'dead', tagIds: ['ghost'] },
      ],
      searchQuery: '',
    })
    expect(lanes.map((l) => l.id)).toEqual(['mixed'])
    expect(lanes[0]!.tags.map((t) => t.id)).toEqual(['red'])
  })

  it('applies the search filter to a lane’s cards by key and summary', () => {
    const lanes = assembleLanes({
      cards: [issue('HDR-1', 'login bug'), issue('HDR-2', 'logout flow')],
      tagsState: tagsState({ 'HDR-1': ['red'], 'HDR-2': ['red'] }),
      lanes: [{ id: 'l-red', tagIds: ['red'] }],
      searchQuery: 'login',
    })
    expect(lanes[0]!.items.map((i) => i.key)).toEqual(['HDR-1'])
  })
})
