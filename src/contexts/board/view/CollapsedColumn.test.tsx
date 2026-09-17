import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { BoardIssue } from '~/kernel'
import { testIds } from '~/lib/testids'
import type { ColumnItem } from '../domain'
import { CollapsedColumn } from './CollapsedColumn'

afterEach(() => {
  cleanup()
})

function issue(key: string): BoardIssue {
  return { key, summary: key, statusName: 'Done', typeName: 'Task', labels: [], epic: null }
}

function item(overrides: Partial<ColumnItem> & { id: string }): ColumnItem {
  return {
    card: { kind: 'jira', issue: issue(overrides.id) },
    state: 'idle',
    section: 'main',
    ...overrides,
  }
}

describe('CollapsedColumn', () => {
  it('counts only live main items (excludes leaving and non-main sections)', () => {
    const items = [
      item({ id: 'A' }),
      item({ id: 'B' }),
      item({ id: 'C', state: 'leaving' }),
      item({ id: 'D', section: 'watchlist' }),
    ]
    const { getByText } = render(
      <CollapsedColumn column="Done" items={items} onExpand={() => {}} />,
    )
    expect(getByText('2')).toBeTruthy()
  })

  it('calls onExpand when clicked', () => {
    const onExpand = vi.fn()
    const { getByTestId } = render(<CollapsedColumn column="Done" items={[]} onExpand={onExpand} />)
    fireEvent.click(getByTestId(testIds.collapsedColumn))
    expect(onExpand).toHaveBeenCalledOnce()
  })
})
