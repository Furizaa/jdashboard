export function shouldHandleShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  const active = document.activeElement
  if (active instanceof HTMLInputElement) return false
  if (active instanceof HTMLTextAreaElement) return false
  if (active instanceof HTMLElement && active.isContentEditable) return false
  return true
}
