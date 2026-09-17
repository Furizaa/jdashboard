import { Sparkles } from 'lucide-react'
import { useChangelog } from '~/coordinator'
import { testIds } from '~/lib/testids'

// The automated changelog, rendered under the note but visually separate from it:
// one entry per Refine run, recording that an agent rewrote the note and what it
// changed. Read-only; newest first. Hidden entirely until the first refine.
export function NotesChangelog({ issueKey }: { issueKey: string }) {
  const query = useChangelog(issueKey)
  const entries = query.data?.entries ?? []
  if (entries.length === 0) return null

  return (
    <section
      data-testid={testIds.notesChangelog}
      aria-label="Automated changelog"
      className="border-border mt-6 border-t px-5 pt-4 pb-5"
    >
      <h2 className="text-ink-subtle mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        <Sparkles size={12} className="text-[#c084fc]" />
        Automated Changelog
      </h2>
      <ol className="flex flex-col gap-3">
        {[...entries].reverse().map((entry) => (
          <li key={entry.at} className="flex flex-col gap-0.5">
            <time
              dateTime={entry.at}
              className="text-ink-tertiary font-mono text-[10px] tracking-wide"
            >
              {formatTimestamp(entry.at)}
            </time>
            <p className="text-ink-subtle text-xs leading-relaxed">{entry.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
