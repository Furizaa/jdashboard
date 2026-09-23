import { testIds } from '~/lib/testids'
import type { PaletteSourceNote } from '../domain'
import { sourceList } from './PaletteFooter'

export function PaletteEmpty({
  query,
  sources,
}: {
  query: string
  sources: readonly PaletteSourceNote[]
}) {
  const loading = sources.filter((s) => s.state === 'loading')
  const unavailable = sources.filter((s) => s.state === 'unavailable')

  return (
    <div
      data-testid={testIds.commandPaletteEmpty}
      className="text-ink-tertiary px-4 py-10 text-center text-xs"
    >
      {query.trim() === '' ? (
        <span>Nothing on the board yet.</span>
      ) : (
        <span>
          No match for <span className="text-ink-subtle font-medium">{query}</span>.
        </span>
      )}
      {/* An empty list while a source is still in flight is not the same claim
          as an empty list once everything has arrived. Say which one it is. */}
      {loading.length > 0 && (
        <div className="mt-1.5">{sourceList(loading)} still loading — this may not be all.</div>
      )}
      {unavailable.length > 0 && (
        <div className="mt-1.5">{sourceList(unavailable)} unavailable — this may not be all.</div>
      )}
    </div>
  )
}
