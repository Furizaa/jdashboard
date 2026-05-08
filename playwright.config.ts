import { defineConfig, devices } from '@playwright/test'

const PORT = 4004
const MOCK_PORT = 9999

const baseEnv: Record<string, string> = {
  // Point Atlassian and GitLab traffic at the MSW sidecar so the built server
  // dials 127.0.0.1:9999 instead of any real upstream.
  JIRA_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  GITLAB_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  // Test-only stubs for required env vars; values are not consumed by the
  // mock sidecar but must pass the boot-time `getServerEnv()` validation.
  JIRA_EMAIL: 'e2e@test.local',
  JIRA_API_TOKEN: 'e2e-jira-token',
  JIRA_PROJECT_KEY: 'HDR',
  JIRA_LABEL_FILTER: 'Frontend',
  JIRA_DONE_WINDOW_DAYS: '14',
  GITLAB_TOKEN: 'e2e-gitlab-token',
  GITLAB_PROJECT_PATH: 'e2e/test-project',
  NODE_ENV: 'production',
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
