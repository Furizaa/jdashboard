# 100 — The SKILL teaches an agent how to date a lane

**Type:** AFK

## Parent

[The Gantt View PRD](../prds/gantt-view.md) · [ADR-0012 §4, §12](../../docs/adr/0012-gantt-charts-as-a-system-of-record.md)

## Why

The `HDR-20708` chart is the evidence: an agent followed the SKILL faithfully, got the structure and all 53 edges right, and produced 29 lanes with no dates at all — because the document teaches the date **format** and never once says where a date comes from. A schema is not a procedure. The skill's own structural tests passed the whole time, because they check that every field is _named_, not that the agent is told how to _fill_ one.

## What to build

A new section in `.claude/skills/clashboard-gantt/SKILL.md` — **"How to date a lane"** — plus the working-order change that makes it reachable. Read the existing document first and match its register: direct second person, reasons given, prose where a sentence explains why.

It must say, in this order:

1. **Ask the server for history first.** `POST {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/dates` dates every lane whose ticket has already started, from its real status transitions. Call it straight after creating a chart from epics, before dating anything by hand — it is one call, it only fills blanks, and it is safe to re-run. **This is the step whose absence produced a chart of 29 undated lanes.** A worked `curl` example, like every other verb has.
2. **What it leaves for you.** Lanes whose ticket has not started, and the forecast end of work still in flight. Those are judgement, which is why the server does not guess them.
3. **How to forecast an end for work in flight.** Take the seeded `start`, add the remaining effort you can justify, and say in the lane's body where the number came from. If you cannot justify one, leave `end` null — the chart draws an open-ended bar, which is honest, rather than a confident wrong date.
4. **How to date work that has not started.** Schedule it from the dependency graph the chart already holds: a lane starts no earlier than the latest `end` of everything with a `blocks` edge into it. Fetch the chart, read its `edges`, and work forward from the dated lanes. Where a ticket states its own sequencing in prose — HDR-20945 says "Start this ticket after the full PRD of HDR-20708 is implemented and released" — treat that as a dependency and declare the edge, so the next reader sees it as an arrow rather than having to re-read the ticket.
5. **Duration.** Use an estimate if the ticket carries one. If it does not, pick a default you state out loud, apply it consistently, and record it in the body of the lane you applied it to. A stated assumption is a thing a human can correct; an unstated one is a thing they have to reverse-engineer.
6. **Date your own PRD lanes too.** On the real chart the 5 local lanes an agent authored (`foundation`, `shared-components`, …) were left undated while their Jira children got dates — so the parents drew only the thin derived underlay and no bar of their own. A parent carries its **own** declared span on purpose (ADR-0012 §4): that is what lets "this PRD is Q4" exist before it is decomposed, and it is what makes the child-span underlay mean something, because overflow is only visible when there is a declared window to overflow. Set them, and let the underlay disagree if the children have slipped.
7. **Never leave a chart silently undated.** If you finish and lanes remain undated, say which and why in your reply. A chart of undated lanes renders as an empty grid, and the person who asked for it cannot tell your judgement from your omission.

Also update the **working order** section so dating is a numbered step rather than advice buried later, and extend the existing "a node field by field" entry for `start` / `end` with a pointer to the new section.

## Acceptance criteria

- [ ] The skill has a "How to date a lane" section covering all seven points above.
- [ ] It carries a worked `curl` for `POST …/dates`, and the existing test that validates every `curl` body against the real schema still passes (this verb takes no body — make sure the extractor handles that rather than failing or silently skipping it; if it would skip, add a case so the endpoint is still asserted to exist).
- [ ] The dating step appears in the skill's working order, positioned immediately after chart creation.
- [ ] A new test asserts the skill mentions `POST` to the `/dates` endpoint and the phrase that tells an agent it only fills blanks — the instruction whose absence caused the failure, so its presence is worth pinning.
- [ ] **Prove the new test has teeth**: delete the `/dates` instruction, confirm the test fails, restore it. Report what you saw.
- [ ] `pnpm typecheck`, `pnpm lint` (zero new warnings), `pnpm test`, prettier (including `*.md`) all pass.

## Two things the previous slices handed over

- **`gantt-skill.test.ts`'s `EVERY_VERB` / `KNOWN_ROUTES` are hand-maintained lists**, so slice 98's `POST /charts/:chartId/dates` is currently undocumented _and_ unasserted — an undocumented route is not a test failure today. Add it to both, so the test that exists to catch a missing instruction can actually catch this one.
- **`view-model/__fixtures__/demo-chart.ts` has no open-ended lane**, though the renderer now has that state (slice 99). Its own comment says "anything new the renderer has to handle gets a lane here rather than a second fixture". Add one — a lane with a `start` and `end: null` — and update whatever e2e counts it moves (`tests/e2e/gantt/needs-attention.spec.ts` asserts a total). Small, but it is the difference between the e2e world covering the in-flight bar and merely not contradicting it.

## The real acceptance test

After this lands, delete nothing and re-run the original task by hand: hand an agent the copied SKILL and ask it to build a chart for an epic. It should date the chart without being told to. Report whether it did.

## Blocked by

- [98 — Dates from status history](./98-gantt-dates-from-status-history.md)
