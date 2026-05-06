const REQUIRED_ENV_KEYS = [
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'JIRA_PROJECT_KEY',
  'JIRA_LABEL_FILTER',
  'JIRA_DONE_WINDOW_DAYS',
] as const

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number]

export type ServerEnv = {
  JIRA_BASE_URL: string
  JIRA_EMAIL: string
  JIRA_API_TOKEN: string
  JIRA_PROJECT_KEY: string
  JIRA_LABEL_FILTER: string
  JIRA_DONE_WINDOW_DAYS: number
}

let cached: ServerEnv | null = null

function readAndValidate(): ServerEnv {
  const missing: Array<RequiredEnvKey> = []
  const values: Partial<Record<RequiredEnvKey, string>> = {}

  for (const key of REQUIRED_ENV_KEYS) {
    const raw = process.env[key]
    if (raw === undefined || raw.trim() === '') {
      missing.push(key)
    } else {
      values[key] = raw.trim()
    }
  }

  if (missing.length > 0) {
    const message =
      `[clashboard] Missing or empty required environment variable(s): ${missing.join(', ')}.\n` +
      `             See .env.example for the full list and copy it to .env.`
    console.error(message)
    throw new Error(message)
  }

  const doneWindowRaw = values.JIRA_DONE_WINDOW_DAYS!
  const doneWindow = Number.parseInt(doneWindowRaw, 10)
  if (!Number.isFinite(doneWindow) || doneWindow < 0) {
    const message =
      `[clashboard] JIRA_DONE_WINDOW_DAYS must be a non-negative integer, got "${doneWindowRaw}".`
    console.error(message)
    throw new Error(message)
  }

  const baseUrl = values.JIRA_BASE_URL!.replace(/\/+$/, '')

  return {
    JIRA_BASE_URL: baseUrl,
    JIRA_EMAIL: values.JIRA_EMAIL!,
    JIRA_API_TOKEN: values.JIRA_API_TOKEN!,
    JIRA_PROJECT_KEY: values.JIRA_PROJECT_KEY!,
    JIRA_LABEL_FILTER: values.JIRA_LABEL_FILTER!,
    JIRA_DONE_WINDOW_DAYS: doneWindow,
  }
}

export function getServerEnv(): ServerEnv {
  if (cached === null) {
    cached = readAndValidate()
  }
  return cached
}
