export type PanelKeyIntent = 'next' | 'prev' | 'open' | 'copy'

const KEY_INTENTS: Readonly<Record<string, PanelKeyIntent>> = {
  j: 'next',
  ArrowDown: 'next',
  k: 'prev',
  ArrowUp: 'prev',
  o: 'open',
  c: 'copy',
}

export function panelKeyIntent(event: KeyboardEvent): PanelKeyIntent | null {
  return KEY_INTENTS[event.key.toLowerCase()] ?? KEY_INTENTS[event.key] ?? null
}
