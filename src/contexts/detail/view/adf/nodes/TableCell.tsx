import type { ReactNode } from 'react'

// Shared by `tableHeader` and `tableCell`. The per-cell `background` attr is
// ignored: Jira's palette is light pastels, unreadable against this panel.
const CELL = 'border-border space-y-2 border px-2.5 py-1.5 align-top'

export function TableCell({
  header,
  colSpan,
  rowSpan,
  children,
}: {
  header: boolean
  colSpan?: number
  rowSpan?: number
  children: ReactNode
}) {
  return header ? (
    <th
      className={`${CELL} bg-muted/40 text-foreground text-left font-semibold`}
      colSpan={colSpan}
      rowSpan={rowSpan}
    >
      {children}
    </th>
  ) : (
    <td className={`${CELL} text-foreground/85`} colSpan={colSpan} rowSpan={rowSpan}>
      {children}
    </td>
  )
}
