import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'
import { workspaceNameHasKey } from '../domain'

// cmux's 16 named colors, each with a representative swatch hex. cmux resolves
// the name; the hex is only for the picker preview.
const WORKSPACE_COLORS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Red', hex: '#E5484D' },
  { name: 'Crimson', hex: '#E93D82' },
  { name: 'Orange', hex: '#F76B15' },
  { name: 'Amber', hex: '#FFB224' },
  { name: 'Olive', hex: '#9E9D24' },
  { name: 'Green', hex: '#30A46C' },
  { name: 'Teal', hex: '#12A594' },
  { name: 'Aqua', hex: '#05A2C2' },
  { name: 'Blue', hex: '#3E63DD' },
  { name: 'Navy', hex: '#2F4DA0' },
  { name: 'Indigo', hex: '#5B5BD6' },
  { name: 'Purple', hex: '#8E4EC6' },
  { name: 'Magenta', hex: '#D6409F' },
  { name: 'Rose', hex: '#E54666' },
  { name: 'Brown', hex: '#AD7F58' },
  { name: 'Charcoal', hex: '#4B5563' },
]

export type WorkspaceModalConfirm = {
  branchName?: string
  workspaceName: string
  color?: string
}

export function WorkspaceModal({
  open,
  issueKey,
  worktreeExists,
  lockedBranch,
  initialBranchName,
  initialWorkspaceName,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  issueKey: string
  worktreeExists: boolean
  lockedBranch: boolean
  initialBranchName: string
  initialWorkspaceName: string
  isPending: boolean
  onConfirm: (opts: WorkspaceModalConfirm) => void
  onCancel: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [branch, setBranch] = useState(initialBranchName)
  const [name, setName] = useState(initialWorkspaceName)
  const [color, setColor] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setBranch(initialBranchName)
      setName(initialWorkspaceName)
      setColor(null)
    }
  }, [open, initialBranchName, initialWorkspaceName])

  const trimmedName = name.trim()
  const trimmedBranch = branch.trim()
  const nameHasKey = workspaceNameHasKey(name, issueKey)
  const nameValid = trimmedName.length > 0 && nameHasKey
  const branchValid = worktreeExists || trimmedBranch.length > 0
  const canSubmit = nameValid && branchValid && !isPending

  const submit = () => {
    if (!canSubmit) return
    onConfirm({
      workspaceName: trimmedName,
      branchName: worktreeExists ? undefined : trimmedBranch,
      color: color ?? undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isPending && onCancel()}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => {
          if (isPending) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault()
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          nameRef.current?.focus()
          nameRef.current?.select()
        }}
        className="w-[min(28rem,calc(100vw-2rem))] gap-0 p-6 sm:max-w-[28rem]"
      >
        <DialogTitle className="text-foreground mb-1 text-[15px] font-semibold tracking-[-0.015em]">
          Open workspace for {issueKey}
        </DialogTitle>
        <p className="text-ink-subtle mb-4 text-xs">
          {worktreeExists ? (
            <>An existing worktree will be reused.</>
          ) : lockedBranch ? (
            <>This work item already has an MR. The workspace will use its existing branch.</>
          ) : (
            <>
              A new worktree will be created from <code>origin/develop</code>.
            </>
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label
              htmlFor="workspace-name-input"
              className="text-ink-subtle mb-1.5 block text-[11px] font-medium tracking-wide"
            >
              Workspace name
            </label>
            <input
              id="workspace-name-input"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={trimmedName.length > 0 && !nameHasKey}
              className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-visible:ring-ring focus:border-border-strong aria-[invalid=true]:border-destructive w-full rounded-md border px-2.5 py-2 text-[13px] transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            />
            {trimmedName.length > 0 && !nameHasKey && (
              <p className="text-destructive mt-1.5 text-[11px]">
                Name must include the ticket number <code>{issueKey}</code>.
              </p>
            )}
          </div>

          <div>
            <span className="text-ink-subtle mb-1.5 block text-[11px] font-medium tracking-wide">
              Color
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <ColorSwatch
                label="No color"
                selected={color === null}
                onClick={() => setColor(null)}
                disabled={isPending}
              />
              {WORKSPACE_COLORS.map((c) => (
                <ColorSwatch
                  key={c.name}
                  label={c.name}
                  hex={c.hex}
                  selected={color === c.name}
                  onClick={() => setColor(c.name)}
                  disabled={isPending}
                />
              ))}
            </div>
          </div>

          {!worktreeExists && (
            <div>
              <label
                htmlFor="branch-name-input"
                className="text-ink-subtle mb-1.5 block text-[11px] font-medium tracking-wide"
              >
                {lockedBranch ? 'Existing branch' : 'Branch name'}
              </label>
              <input
                id="branch-name-input"
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={isPending}
                readOnly={lockedBranch}
                spellCheck={false}
                autoComplete="off"
                className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus-visible:ring-ring focus:border-border-strong w-full rounded-md border px-2.5 py-2 font-mono text-[13px] transition-colors read-only:cursor-default read-only:opacity-70 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
              />
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              <span>Open Workspace</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ColorSwatch({
  label,
  hex,
  selected,
  onClick,
  disabled,
}: {
  label: string
  hex?: string
  selected: boolean
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={
        'focus-visible:ring-ring relative h-6 w-6 rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 ' +
        (selected ? 'ring-foreground ring-2 ring-offset-2 ring-offset-transparent ' : '') +
        (hex === undefined ? 'border-border bg-surface-1' : 'border-black/10')
      }
      style={hex === undefined ? undefined : { backgroundColor: hex }}
    >
      {hex === undefined && <span className="text-ink-tertiary text-[9px]">none</span>}
    </button>
  )
}
