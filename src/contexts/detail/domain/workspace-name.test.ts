import { describe, expect, it } from 'vitest'
import { defaultWorkspaceName, workspaceNameHasKey } from './workspace-name'

describe('defaultWorkspaceName', () => {
  it('prefixes GeoCloud, a title slug of up to three words, then the key', () => {
    expect(
      defaultWorkspaceName({ issueKey: 'HDR-19529', title: 'Trajectory minimap for the map' }),
    ).toBe('GeoCloud Trajectory Minimap For HDR-19529')
  })

  it('strips punctuation from title words', () => {
    expect(defaultWorkspaceName({ issueKey: 'HDR-1', title: 'Fix: crash (on zoom)' })).toBe(
      'GeoCloud Fix Crash On HDR-1',
    )
  })

  it('falls back to GeoCloud <key> when the title yields no words', () => {
    expect(defaultWorkspaceName({ issueKey: 'HDR-7', title: '   ' })).toBe('GeoCloud HDR-7')
  })
})

describe('workspaceNameHasKey', () => {
  it('accepts a name that carries the key as a token', () => {
    expect(workspaceNameHasKey('GeoCloud Invite HDR-20142', 'HDR-20142')).toBe(true)
  })

  it('rejects a name without the key', () => {
    expect(workspaceNameHasKey('GeoCloud Invite', 'HDR-20142')).toBe(false)
  })

  it('does not match a shorter key inside a longer number', () => {
    expect(workspaceNameHasKey('GeoCloud HDR-201420', 'HDR-20142')).toBe(false)
  })

  it('does not match a key that is a digit-prefix of another', () => {
    expect(workspaceNameHasKey('GeoCloud HDR-19', 'HDR-1')).toBe(false)
  })
})
