import { describe, expect, it } from 'vitest'
import type { BoardIssue, GetWatchlistCardsResult, TagDefinition, TagsState } from '~/kernel'
import { derive } from './watchlist-board-view-model'

function issue(key: string): BoardIssue {
  return {
    key,
    summary: key,
    statusName: 'In Implementation',
    typeName: 'Task',
    labels: [],
    epic: null,
  }
}

const RED: TagDefinition = { id: 'red', name: 'Red', colorId: 'red' }

const okCards = (cards: BoardIssue[]): GetWatchlistCardsResult => ({
  ok: true,
  baseUrl: 'https://jira.example',
  cards,
})

const READY_QUERY = { isPending: false, isError: false, error: undefined }

function tags(attachments: Record<string, string[]>): TagsState {
  return { definitions: [RED], attachments }
}

describe('watchlist-board-view-model derive', () => {
  it('is loading while the cards query is pending', () => {
    expect(
      derive({
        queryData: { data: undefined, isPending: true, isError: false, error: undefined },
        tagsState: tags({}),
        lanes: [{ id: 'l-red', tagIds: ['red'] }],
        searchQuery: '',
      }),
    ).toEqual({ phase: 'loading' })
  })

  it('is loading while local tag/lane state is still hydrating', () => {
    expect(
      derive({
        queryData: { ...READY_QUERY, data: okCards([]) },
        tagsState: undefined,
        lanes: undefined,
        searchQuery: '',
      }),
    ).toEqual({ phase: 'loading' })
  })

  it('is unauthorized when the cards query returns ok:false', () => {
    expect(
      derive({
        queryData: {
          ...READY_QUERY,
          data: { ok: false, error: { _tag: 'Unauthorized' } } as GetWatchlistCardsResult,
        },
        tagsState: tags({}),
        lanes: [{ id: 'l-red', tagIds: ['red'] }],
        searchQuery: '',
      }),
    ).toEqual({ phase: 'unauthorized' })
  })

  it('is error-hard on a network error with no cached data', () => {
    const result = derive({
      queryData: { data: undefined, isPending: false, isError: true, error: new Error('boom') },
      tagsState: tags({}),
      lanes: [{ id: 'l-red', tagIds: ['red'] }],
      searchQuery: '',
    })
    expect(result.phase).toBe('error-hard')
  })

  it('is no-lanes when nothing is configured', () => {
    expect(
      derive({
        queryData: { ...READY_QUERY, data: okCards([issue('HDR-1')]) },
        tagsState: tags({ 'HDR-1': ['red'] }),
        lanes: [],
        searchQuery: '',
      }),
    ).toEqual({ phase: 'no-lanes' })
  })

  it('is no-lanes when every configured tag was deleted', () => {
    expect(
      derive({
        queryData: { ...READY_QUERY, data: okCards([issue('HDR-1')]) },
        tagsState: tags({ 'HDR-1': ['red'] }),
        lanes: [{ id: 'g', tagIds: ['ghost'] }],
        searchQuery: '',
      }),
    ).toEqual({ phase: 'no-lanes' })
  })

  it('is ready with assembled lanes when configured', () => {
    const result = derive({
      queryData: { ...READY_QUERY, data: okCards([issue('HDR-1')]) },
      tagsState: tags({ 'HDR-1': ['red'] }),
      lanes: [{ id: 'l-red', tagIds: ['red'] }],
      searchQuery: '',
    })
    expect(result).toMatchObject({
      phase: 'ready',
      baseUrl: 'https://jira.example',
    })
    if (result.phase !== 'ready') throw new Error('expected ready')
    expect(result.lanes).toHaveLength(1)
    expect(result.lanes[0]!.items.map((i) => i.key)).toEqual(['HDR-1'])
  })
})
