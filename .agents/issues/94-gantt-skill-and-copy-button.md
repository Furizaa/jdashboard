# 94 — The SKILL and the copy button

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §12](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## What to build

The document that teaches an agent the API, the endpoint and button that deliver it, and the two tests that keep it true.

- **`.claude/skills/clashboard-gantt/SKILL.md`** — new. Frontmatter mirroring `.claude/skills/explain-mr/SKILL.md` (`name`, `description`, `disable-model-invocation: true`). Read that skill first — match its voice: direct second person, reasons given, no bullet-point API dump where a sentence explains why.
  - **Opens with probe-or-stop.** `curl -sf <base>/charts` first; on connection-refused, **stop and report that clashboard is not running**. Never queue work, never fall back to writing files under `~/.clashboard/` directly — that bypasses the write queue, the validation and the audit trail.
  - Teaches the node and edge shapes **field by field**, with the field names spelled exactly as the schema has them.
  - States that `start` / `end` are `YYYY-MM-DD` or `null`, that ids are slugs the agent chooses, and that a node id is also its body's filename.
  - States that **mirrored fields must not be patched on a `jira` node** (`title`, `column`, `status`, `assignee`) and why: sync owns them and will overwrite the attempt.
  - States that **`DELETE /charts/:id` does not exist** and that archiving is the user's action, so the agent must not look for a way to remove a chart.
  - Teaches reading an error: the status code is the category, `issues[]` names the field, and a `400` is something to fix and retry rather than a dead end.
  - **`PUT …/body` takes raw markdown as the request body, not a JSON field** (and `GET …/body` answers `text/markdown`) — slice 93 chose this so an agent never has to JSON-escape a 200-line PRD. The skill must say so explicitly, because every *other* verb takes JSON and an agent will reasonably assume this one does too. Error bodies on that route are still JSON, like everywhere else.
  - Carries at least one **worked `curl` example per verb**, with a complete, valid body. The second test below validates these, and the explain-skill test's comment records what it costs when an example is missing.
  - Placeholders `{{BASE_URL}}` and `{{CHART_ID}}` for `renderGanttSkill` to substitute.
- **`src/server/lib/gantt-skill.ts`** — new. `GANTT_SKILL_PATH` (resolved from `process.cwd()` as `ask.ts` and `refine.ts` resolve theirs) and `renderGanttSkill({ baseUrl, chartId })` substituting the placeholders. An unsubstituted placeholder left in the output is a bug the test catches.
- **`src/routes/api/gantt.skill.ts`** — `GET /api/gantt/skill`, `text/markdown`, taking `?chart=` for the substitution and falling back to a documented placeholder when absent.
- **`src/server/server-functions/gantt.ts`** — `getGanttSkill(chartId)` added for the button.
- **`src/contexts/gantt/view/CopySkillButton.tsx`** — copies the rendered SKILL to the clipboard and confirms with a `sonner` toast, as the app's other copy actions do. Placed in the chart's toolbar. `navigator.clipboard` wrapped — a failure shows the toast's error state rather than throwing.
- **`src/server/lib/gantt-skill.test.ts`** — the two structural tests, both modelled on `src/server/lib/explain-skill.test.ts` (read it and its comment first):
  1. **Every required field of every schema in `gantt-schema.ts` is named somewhere in the skill text**, introspected from the Zod shapes rather than listed by hand, so a new field is covered the day it is added.
  2. **Every fenced `curl` body in the skill validates against the real request schema** for the verb it demonstrates. This is the half the explain test does not have, and the half that would have caught the bug its comment describes.

## Acceptance criteria

- [ ] The skill's first instruction is the probe, and it says explicitly to stop rather than queue or write files directly.
- [ ] Test 1 passes, and **fails** when a required field is removed from the skill text (verify by temporarily deleting one mention).
- [ ] Test 2 passes, and **fails** when a `curl` example body is given a wrong field name (verify the same way).
- [ ] `renderGanttSkill` substitutes both placeholders, and a test asserts no `{{` remains in the output.
- [ ] `GET /api/gantt/skill` returns `text/markdown` and substitutes `?chart=` when given.
- [ ] The copy button copies the parameterised text and toasts; a clipboard failure toasts an error rather than throwing.
- [ ] The skill states that `DELETE /charts` does not exist, and that mirrored fields are not patchable on a jira node.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.

## Blocked by

- [93 — The write surface](./93-gantt-write-surface.md)
