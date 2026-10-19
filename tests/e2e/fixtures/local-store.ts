import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GanttChart } from '~/kernel'

// The app's local-only state: tags, the watchlist, notes, and lane config, all
// under `~/.clashboard/`. The e2e server runs with HOME pointed at a throwaway
// directory (see `playwright.config.ts`), so a spec can seed this state the same
// way it seeds Jira and GitLab through the `World`.
//
// Kept separate from `World` on purpose: the World models what the *network*
// returns, and these are files on disk, not a mocked HTTP boundary (ADR-0001).

export type SeededTag = {
  readonly id: string
  readonly name: string
  readonly colorId: string
}

function homeDir(): string {
  const home = process.env.CLASHBOARD_E2E_HOME
  if (home === undefined || home === '') {
    throw new Error('CLASHBOARD_E2E_HOME is unset — playwright.config.ts should have set it')
  }
  return home
}

function storeDir(): string {
  return join(homeDir(), '.clashboard')
}

export class LocalStore {
  async seedTags(
    definitions: readonly SeededTag[],
    attachments: Readonly<Record<string, readonly string[]>> = {},
  ): Promise<void> {
    await this.write('tags.json', { definitions, attachments })
  }

  async seedWatchlist(keys: readonly string[]): Promise<void> {
    await this.write('watchlist.json', { keys })
  }

  /**
   * One Gantt chart on disk, in the layout `gantt-store.ts` reads: the skeleton
   * as `chart.json` and each lane's document as `bodies/<nodeId>.md`.
   *
   * A chart is the one thing under `~/.clashboard/` the app is the **system of
   * record** for (ADR-0012 §1), so there is no HTTP boundary to mock for it and
   * no `CLASHBOARD_HOME` override to point somewhere else — the throwaway `HOME`
   * is the whole isolation, exactly as it is for tags and notes. The specs seed
   * the committed fixture from `contexts/gantt/view-model/__fixtures__`, so the
   * chart the e2e looks at and the chart the layout tests reason about are one
   * world.
   */
  async seedGanttChart(
    chart: GanttChart,
    bodies: Readonly<Record<string, string>> = {},
  ): Promise<void> {
    const dir = join(storeDir(), 'gantt', chart.id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'chart.json'), `${JSON.stringify(chart, null, 2)}\n`, 'utf8')
    if (Object.keys(bodies).length === 0) return
    await mkdir(join(dir, 'bodies'), { recursive: true })
    await Promise.all(
      Object.entries(bodies).map(([nodeId, markdown]) =>
        writeFile(join(dir, 'bodies', `${nodeId}.md`), markdown, 'utf8'),
      ),
    )
  }

  /** Wipe every local file, so one spec's state never leaks into the next. */
  async reset(): Promise<void> {
    await rm(storeDir(), { recursive: true, force: true })
  }

  private async write(file: string, value: unknown): Promise<void> {
    await mkdir(storeDir(), { recursive: true })
    await writeFile(join(storeDir(), file), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }
}
