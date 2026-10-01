import type { ReactNode } from 'react'

// Wide tables scroll inside the (min-w-0) description column rather than
// widening the panel. Jira's per-cell `colwidth` pixel hints are ignored —
// `AdfNode.attrs` cannot carry the array they arrive as — as is
// `isNumberColumnEnabled`, so there is no synthesised row-number column.
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
