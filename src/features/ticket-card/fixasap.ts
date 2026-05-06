export function hasFixasapLabel(labels: readonly string[]): boolean {
  return labels.some((label) => label.toLowerCase() === 'fixasap')
}
