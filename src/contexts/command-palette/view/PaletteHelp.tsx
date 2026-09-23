import { testIds } from '~/lib/testids'
import type { PaletteHelpGroupView } from '../view-model'

/**
 * The shortcut reference, generated from `kernel/commands.ts` — see
 * `deriveHelpGroups`. A curated static map is only an advantage if it is
 * discoverable, and a hand-written table beside it would rot on the first
 * action added.
 */
export function PaletteHelp({ groups }: { groups: readonly PaletteHelpGroupView[] }) {
  return (
    <div data-testid={testIds.commandPaletteHelp} className="px-4 py-2">
      <p className="text-ink-tertiary mb-3 text-xs">
        Press a key on an item&apos;s action list to run it. Only the actions legal for that item
        are offered.
      </p>
      {groups.map((group) => (
        <div key={group.group} className="mb-3 last:mb-0">
          <div className="text-ink-tertiary pb-1 text-[10px] font-semibold tracking-wider uppercase">
            {group.label}
          </div>
          <dl className="grid grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-1">
            {group.rows.map((row) => (
              <div key={row.kind} className="col-span-2 grid grid-cols-subgrid items-center">
                <dt>
                  <kbd
                    data-testid={testIds.commandPaletteHelpKey}
                    data-action-kind={row.kind}
                    className="bg-surface-2 border-border text-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border px-1.5 font-mono text-[11px] leading-none"
                  >
                    {row.shortcut}
                  </kbd>
                </dt>
                <dd className="text-ink-subtle truncate text-[13px]">{row.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
