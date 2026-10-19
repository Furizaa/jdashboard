import { join } from 'node:path'
import { loadSkillBody } from './claude-cli'

// The SKILL that teaches an agent the Gantt REST API, read off disk and
// parameterised with the base URL and the chart id (ADR-0012 §12).
//
// The whole document is **copied**, not installed: the button on the chart's
// header puts this text on the clipboard with both placeholders already
// substituted, so pasting it into an agent and saying "add a PRD for tier
// migration" needs no further briefing. Copying an install command was rejected
// as an indirection that can silently diverge from the running server, and
// copying the file verbatim was rejected because substituting the base URL and
// the chart id by hand is the step that is easiest to get wrong.
//
// Two structural tests keep the document honest — `gantt-skill.test.ts` asserts
// that it names every field the schema has and that its literal `curl` bodies
// validate against the real request schemas. `explain-skill.test.ts`'s comment
// records what the absence of such a test costs.

/**
 * Resolved from `process.cwd()`, exactly as `EXPLAIN_SKILL_PATH` is: the skills
 * live in the repository beside the code that serves them, and reading them
 * fresh on every call keeps an edit live without a server restart.
 */
export const GANTT_SKILL_PATH = join(
  process.cwd(),
  '.claude',
  'skills',
  'clashboard-gantt',
  'SKILL.md',
)

/** The two tokens `renderGanttSkill` substitutes. A leftover is a bug the test catches. */
export const GANTT_SKILL_PLACEHOLDERS = {
  baseUrl: '{{BASE_URL}}',
  chartId: '{{CHART_ID}}',
} as const

/**
 * What goes in when the caller cannot say. The base URL is where `vite dev`
 * binds (`vite.config.ts`), which is the only place this API has ever existed;
 * the chart id is a **valid slug** on purpose, so a copy that forgets to
 * substitute it fails with a clean `404 ChartNotFound` rather than a `400` about
 * a malformed id — a far more legible way for an agent to discover that it is
 * pointed at nothing.
 */
export const GANTT_SKILL_FALLBACK_BASE_URL = 'http://localhost:4004'
export const GANTT_SKILL_FALLBACK_CHART_ID = 'your-chart-id'

/**
 * The SKILL with both placeholders filled in. The YAML frontmatter is stripped
 * by `loadSkillBody`: `disable-model-invocation` is harness configuration, and
 * this text is pasted into an agent as an instruction rather than installed as a
 * skill file.
 */
export async function renderGanttSkill({
  baseUrl,
  chartId,
}: {
  readonly baseUrl?: string | null
  readonly chartId?: string | null
}): Promise<string> {
  const body = await loadSkillBody(GANTT_SKILL_PATH)
  // A trailing slash would make every path in the document a double slash.
  const base = (baseUrl ?? GANTT_SKILL_FALLBACK_BASE_URL).replace(/\/+$/u, '')
  return body
    .replaceAll(GANTT_SKILL_PLACEHOLDERS.baseUrl, base)
    .replaceAll(GANTT_SKILL_PLACEHOLDERS.chartId, chartId ?? GANTT_SKILL_FALLBACK_CHART_ID)
}
