export const LABEL_COLOR_PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const

export function colorForLabel(label: string): string {
  let hash = 5381
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 33) ^ label.charCodeAt(i)
  }
  const idx = Math.abs(hash | 0) % LABEL_COLOR_PALETTE.length
  return LABEL_COLOR_PALETTE[idx]!
}
