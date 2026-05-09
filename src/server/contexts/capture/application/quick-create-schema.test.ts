import { describe, expect, it } from 'vitest'
import { quickCreateSchema } from './quick-create-schema'

describe('quickCreateSchema', () => {
  const valid = {
    type: 'Bug' as const,
    parentKey: 'HDR-3817',
    summary: 'Something broke',
    description: 'Steps to reproduce…',
  }

  it('parses a fully valid input', () => {
    const result = quickCreateSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(valid)
    }
  })

  it('rejects an empty summary', () => {
    const result = quickCreateSchema.safeParse({ ...valid, summary: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty description', () => {
    const result = quickCreateSchema.safeParse({ ...valid, description: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty parentKey', () => {
    const result = quickCreateSchema.safeParse({ ...valid, parentKey: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid type ("Epic")', () => {
    const result = quickCreateSchema.safeParse({ ...valid, type: 'Epic' })
    expect(result.success).toBe(false)
  })
})
