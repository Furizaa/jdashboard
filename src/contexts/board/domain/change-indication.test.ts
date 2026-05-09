import { describe, expect, it } from 'vitest'
import { diffChange, indexBy, type ChangeOptions } from './change-indication'

type Row = { id: string; bucket: string }

const ROW_OPTIONS: ChangeOptions<Row> = {
  id: (r) => r.id,
  equals: (a, b) => a.bucket === b.bucket,
}

describe('diffChange', () => {
  it('returns no diffs on the first delivery (prev === null)', () => {
    const current = indexBy([{ id: 'a', bucket: 'x' }], ROW_OPTIONS.id)
    const result = diffChange(null, current, ROW_OPTIONS, new Map())
    expect(result.entering.size).toBe(0)
    expect(result.changed.size).toBe(0)
    expect(result.leavingNow.size).toBe(0)
    expect(result.returning.size).toBe(0)
    expect(result.currentByKey).toBe(current)
  })

  it('marks newly appeared keys as entering when not in leaving carry', () => {
    const prev = indexBy([{ id: 'a', bucket: 'x' }], ROW_OPTIONS.id)
    const current = indexBy(
      [
        { id: 'a', bucket: 'x' },
        { id: 'b', bucket: 'y' },
      ],
      ROW_OPTIONS.id,
    )
    const result = diffChange(prev, current, ROW_OPTIONS, new Map())
    expect(result.entering).toEqual(new Set(['b']))
    expect(result.returning.size).toBe(0)
  })

  it("marks keys whose content changed (per equals) as 'changed'", () => {
    const prev = indexBy([{ id: 'a', bucket: 'x' }], ROW_OPTIONS.id)
    const current = indexBy([{ id: 'a', bucket: 'y' }], ROW_OPTIONS.id)
    const result = diffChange(prev, current, ROW_OPTIONS, new Map())
    expect(result.changed).toEqual(new Set(['a']))
    expect(result.entering.size).toBe(0)
  })

  it('records removed keys in leavingNow with their prev item snapshot', () => {
    const prev = indexBy(
      [
        { id: 'a', bucket: 'x' },
        { id: 'b', bucket: 'y' },
      ],
      ROW_OPTIONS.id,
    )
    const current = indexBy([{ id: 'a', bucket: 'x' }], ROW_OPTIONS.id)
    const result = diffChange(prev, current, ROW_OPTIONS, new Map())
    expect([...result.leavingNow.keys()]).toEqual(['b'])
    expect(result.leavingNow.get('b')).toEqual({ id: 'b', bucket: 'y' })
  })

  it('marks reappeared (in leaving carry) keys as returning, not entering', () => {
    const prev = indexBy([{ id: 'a', bucket: 'x' }], ROW_OPTIONS.id)
    const current = indexBy(
      [
        { id: 'a', bucket: 'x' },
        { id: 'b', bucket: 'y' },
      ],
      ROW_OPTIONS.id,
    )
    const leaving = new Map<string, Row>([['b', { id: 'b', bucket: 'y' }]])
    const result = diffChange(prev, current, ROW_OPTIONS, leaving)
    expect(result.returning).toEqual(new Set(['b']))
    expect(result.entering.size).toBe(0)
  })

  it('does not mark a card as changed when no compared field changed', () => {
    const prev = indexBy([{ id: 'a', bucket: 'x' }], ROW_OPTIONS.id)
    const current = indexBy([{ id: 'a', bucket: 'x' }], ROW_OPTIONS.id)
    const result = diffChange(prev, current, ROW_OPTIONS, new Map())
    expect(result.changed.size).toBe(0)
    expect(result.entering.size).toBe(0)
    expect(result.leavingNow.size).toBe(0)
  })

  it('does not detect changes by an unrelated field per equals predicate', () => {
    type Wide = { id: string; bucket: string; title: string }
    const opts: ChangeOptions<Wide> = {
      id: (r) => r.id,
      equals: (a, b) => a.bucket === b.bucket,
    }
    const prev = indexBy([{ id: 'a', bucket: 'x', title: 'first' }], opts.id)
    const current = indexBy([{ id: 'a', bucket: 'x', title: 'second' }], opts.id)
    const result = diffChange(prev, current, opts, new Map())
    expect(result.changed.size).toBe(0)
  })
})

describe('indexBy', () => {
  it('builds a map keyed by id selector', () => {
    const items = [
      { id: 'a', bucket: 'x' },
      { id: 'b', bucket: 'y' },
    ]
    const map = indexBy(items, (r) => r.id)
    expect(map.get('a')).toEqual({ id: 'a', bucket: 'x' })
    expect(map.get('b')).toEqual({ id: 'b', bucket: 'y' })
  })
})
