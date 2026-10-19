import { describe, expect, it } from 'vitest'
import { validateGanttSearch } from './gantt-search'

// The URL is hostile input. Every malformed form is *dropped*, never rejected —
// a bad link lands on the chart list rather than on an error page. And since a
// chart id becomes a folder name and a node id a filename on the server, the
// slug charset is held to here too rather than trusted downstream.

describe('validateGanttSearch — ?chart=', () => {
  it('keeps a slug-shaped chart id', () => {
    expect(validateGanttSearch({ chart: 'pricing-rework' }).chart).toBe('pricing-rework')
    expect(validateGanttSearch({ chart: '  pricing-rework  ' }).chart).toBe('pricing-rework')
    expect(validateGanttSearch({ chart: 'q4' }).chart).toBe('q4')
  })

  it.each([
    ['absent', {}],
    ['upper case', { chart: 'Pricing' }],
    ['underscored', { chart: 'pricing_rework' }],
    ['leading hyphen', { chart: '-pricing' }],
    ['a traversal', { chart: '../escape' }],
    ['slashed', { chart: 'a/b' }],
    ['dotted', { chart: '.archive' }],
    ['spaced', { chart: 'pricing rework' }],
    ['over-long', { chart: 'a'.repeat(65) }],
    ['empty', { chart: '' }],
    ['a number', { chart: 7 }],
    ['null', { chart: null }],
  ])('drops a %s chart id', (_label, search) => {
    expect(validateGanttSearch(search).chart).toBeUndefined()
  })
})

describe('validateGanttSearch — ?node=', () => {
  it('keeps a slug-shaped node alongside its chart', () => {
    expect(validateGanttSearch({ chart: 'pricing-rework', node: 'tier-migration' })).toEqual({
      chart: 'pricing-rework',
      issue: undefined,
      node: 'tier-migration',
    })
  })

  it.each([
    ['upper case', 'Tier'],
    ['underscored', 'tier_migration'],
    ['a traversal', '../escape'],
    ['over-long', 'a'.repeat(65)],
    ['empty', ''],
  ])('drops a %s node but keeps the chart', (_label, node) => {
    expect(validateGanttSearch({ chart: 'pricing-rework', node })).toEqual({
      chart: 'pricing-rework',
      issue: undefined,
      node: undefined,
    })
  })

  it('drops a node that names no chart — it identifies nothing alone', () => {
    expect(validateGanttSearch({ node: 'tier-migration' })).toEqual({
      chart: undefined,
      issue: undefined,
      node: undefined,
    })
  })
})

describe('validateGanttSearch — ?issue=', () => {
  it('keeps a ticket on its own: the detail panel needs no chart to be useful', () => {
    expect(validateGanttSearch({ issue: 'GEO-120' })).toEqual({
      chart: undefined,
      issue: 'GEO-120',
      node: undefined,
    })
  })

  it('keeps a ticket alongside a chart', () => {
    expect(validateGanttSearch({ chart: 'pricing-rework', issue: 'GEO-120' })).toEqual({
      chart: 'pricing-rework',
      issue: 'GEO-120',
      node: undefined,
    })
  })

  it.each([
    ['absent', {}],
    ['empty', { issue: '' }],
    ['blank', { issue: '   ' }],
    ['a number', { issue: 7 }],
  ])('drops a %s ticket', (_label, search) => {
    expect(validateGanttSearch(search).issue).toBeUndefined()
  })
})
