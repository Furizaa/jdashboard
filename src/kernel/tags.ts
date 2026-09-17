import type { TagDefinition, TagsState } from '~/server/server-functions/tags'

// Local tags: user-defined coloured labels attached to tickets, stored on the
// local machine (see `~/server/lib/tags-store`). The wire types are owned by the
// server-function module and re-exported here so the client refers to them
// through the kernel, never `~/server/...` directly.
export type {
  GetTagsStateResult,
  TagDefinition,
  TagMutationResult,
  TagsState,
} from '~/server/server-functions/tags'

// A tag's colour is a fixed palette member, referenced by id. `swatchBg` /
// `swatchFg` are literal CSS colours (not theme tokens): a tag's meaning is the
// same in light and dark, and the palette is user-facing and stable.
export type TagColor = {
  readonly id: string
  readonly name: string
  readonly swatchBg: string
  readonly swatchFg: string
}

// Twenty combinations. `critical` is first and deliberate: bright red on bright
// white, the loudest chip on a card, reserved for the most important flag.
export const TAG_COLORS: readonly TagColor[] = [
  { id: 'critical', name: 'Critical', swatchBg: '#ffffff', swatchFg: '#dc2626' },
  { id: 'red', name: 'Red', swatchBg: '#dc2626', swatchFg: '#ffffff' },
  { id: 'orange', name: 'Orange', swatchBg: '#ea580c', swatchFg: '#ffffff' },
  { id: 'amber', name: 'Amber', swatchBg: '#f59e0b', swatchFg: '#1c1917' },
  { id: 'yellow', name: 'Yellow', swatchBg: '#eab308', swatchFg: '#1c1917' },
  { id: 'lime', name: 'Lime', swatchBg: '#65a30d', swatchFg: '#ffffff' },
  { id: 'green', name: 'Green', swatchBg: '#16a34a', swatchFg: '#ffffff' },
  { id: 'emerald', name: 'Emerald', swatchBg: '#059669', swatchFg: '#ffffff' },
  { id: 'teal', name: 'Teal', swatchBg: '#0d9488', swatchFg: '#ffffff' },
  { id: 'cyan', name: 'Cyan', swatchBg: '#0891b2', swatchFg: '#ffffff' },
  { id: 'sky', name: 'Sky', swatchBg: '#0284c7', swatchFg: '#ffffff' },
  { id: 'blue', name: 'Blue', swatchBg: '#2563eb', swatchFg: '#ffffff' },
  { id: 'indigo', name: 'Indigo', swatchBg: '#4f46e5', swatchFg: '#ffffff' },
  { id: 'violet', name: 'Violet', swatchBg: '#7c3aed', swatchFg: '#ffffff' },
  { id: 'purple', name: 'Purple', swatchBg: '#9333ea', swatchFg: '#ffffff' },
  { id: 'fuchsia', name: 'Fuchsia', swatchBg: '#c026d3', swatchFg: '#ffffff' },
  { id: 'pink', name: 'Pink', swatchBg: '#db2777', swatchFg: '#ffffff' },
  { id: 'rose', name: 'Rose', swatchBg: '#e11d48', swatchFg: '#ffffff' },
  { id: 'slate', name: 'Slate', swatchBg: '#475569', swatchFg: '#ffffff' },
  { id: 'stone', name: 'Stone', swatchBg: '#57534e', swatchFg: '#ffffff' },
] as const

export const DEFAULT_TAG_COLOR_ID = 'blue'

const COLOR_LOOKUP: ReadonlyMap<string, TagColor> = new Map(TAG_COLORS.map((c) => [c.id, c]))

// Total function: an unknown colour id (e.g. a hand-edited store) falls back to a
// neutral swatch so a chip always renders rather than crashing.
export function resolveTagColor(colorId: string): TagColor {
  return (
    COLOR_LOOKUP.get(colorId) ??
    COLOR_LOOKUP.get(DEFAULT_TAG_COLOR_ID) ?? {
      id: colorId,
      name: colorId,
      swatchBg: '#475569',
      swatchFg: '#ffffff',
    }
  )
}

// Pure join of the two store concerns: the ordered tag definitions attached to a
// single ticket. Attachment order is preserved; ids without a definition are
// dropped (the store already prunes these on read, this is belt-and-braces).
export function resolveTicketTags(state: TagsState, issueKey: string): readonly TagDefinition[] {
  const attached = state.attachments[issueKey]
  if (attached === undefined || attached.length === 0) return []
  const byId = new Map(state.definitions.map((d) => [d.id, d]))
  return attached.flatMap((id) => {
    const def = byId.get(id)
    return def === undefined ? [] : [def]
  })
}
