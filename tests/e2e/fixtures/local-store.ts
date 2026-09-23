import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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

  /** Wipe every local file, so one spec's state never leaks into the next. */
  async reset(): Promise<void> {
    await rm(storeDir(), { recursive: true, force: true })
  }

  private async write(file: string, value: unknown): Promise<void> {
    await mkdir(storeDir(), { recursive: true })
    await writeFile(join(storeDir(), file), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }
}
