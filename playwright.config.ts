import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const PORT = 4004
const MOCK_PORT = 9999

// The app's local state — watchlist, tags, notes, lane config — lives in
// `~/.clashboard/*`, read by the server through `os.homedir()`. Point HOME at a
// throwaway directory so the suite neither reads nor writes the developer's real
// board, and so specs can seed that state deterministically. Node's `homedir()`
// honours $HOME on POSIX, so this is the whole isolation.
//
// The path is fixed rather than `mkdtemp`'d: Playwright re-evaluates this config
// in every worker process, so a random name would give the server and the specs
// two different directories. The suite runs single-worker and non-parallel, so a
// shared fixed path is safe, and each spec wipes it (see the `local` fixture).
const E2E_HOME = join(tmpdir(), 'clashboard-e2e-home')
mkdirSync(E2E_HOME, { recursive: true })
// Surfaced to the runner process so fixtures write where the server reads.
process.env.CLASHBOARD_E2E_HOME = E2E_HOME

const JIRA_LABEL_FILTER = 'Frontend'
// Surface the configured filter to the runner process so specs can read it
// via `process.env.JIRA_LABEL_FILTER` instead of hardcoding the literal.
process.env.JIRA_LABEL_FILTER = JIRA_LABEL_FILTER

const baseEnv: Record<string, string> = {
  // Point Atlassian and GitLab traffic at the MSW sidecar so the built server
  // dials 127.0.0.1:9999 instead of any real upstream.
  JIRA_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  GITLAB_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  // Test-only stubs for required env vars; values are not consumed by the
  // mock sidecar but must pass the boot-time `readServerEnv()` validation.
  JIRA_EMAIL: 'e2e@test.local',
  JIRA_API_TOKEN: 'e2e-jira-token',
  JIRA_PROJECT_KEY: 'HDR',
  JIRA_LABEL_FILTER,
  // Hide the filter label from cards — every issue has it (it's the JQL
  // filter), so showing it on every card is redundant. Mirrors a real-world
  // setup where JIRA_HIDE_LABELS includes JIRA_LABEL_FILTER's value.
  JIRA_HIDE_LABELS: JIRA_LABEL_FILTER,
  JIRA_DONE_WINDOW_DAYS: '14',
  GITLAB_TOKEN: 'e2e-gitlab-token',
  GITLAB_PROJECT_PATH: 'e2e/test-project',
  NODE_ENV: 'production',
  HOME: E2E_HOME,
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    testIdAttribute: 'data-testid',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `--static ../client` resolves relative to `dirname(entry)` (i.e. dist/server),
    // so the final static root is `dist/client` where Vite emits the client assets.
    command: `pnpm build && pnpm exec srvx --prod --port ${PORT} --hostname 127.0.0.1 --static ../client dist/server/server.js`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 180_000,
    env: baseEnv,
  },
})
