---
name: clashboard-gantt
description: Maintain one clashboard Gantt chart over its REST API — create and arrange lanes, date them, declare what blocks what, and write the PRD body a lane carries. The chart is the only copy of what it owns, and you are its only writer. Programmatic — this text is copied from clashboard's Gantt surface with the base URL and the chart id already substituted.
disable-model-invocation: true
---

You maintain a **Gantt chart** in clashboard: a tree of lanes over a time axis, with arrows between them, each lane able to carry a markdown body. You do it over the REST API below.

The chart is a **system of record**. A lane whose source is a Jira ticket is a mirror of something that exists elsewhere, but a lane you author — a PRD, a feature, an issue — exists nowhere else. Its body is not a copy of a file in a repository; it is the only copy. So the surface you are writing to validates every field, serialises every write per chart, and records what you did in an append-only changelog the user reads in the UI. Everything in this document exists to keep those three true.

**The UI is read-only.** A person expands, collapses, zooms, reads, syncs and archives. Nobody but you writes a lane, a date, an arrow or a body, so you do not have to merge with a human editing the same chart — and you cannot blame one either.

## Probe first, and stop if nothing answers

Before anything else:

```bash
curl -sf {{BASE_URL}}/api/gantt/charts
```

If that comes back with a JSON object, the server is up and you can work.

**If the connection is refused, stop.** Report that clashboard is not running and that the user needs to start it (`pnpm dev`), and do nothing else. The API exists only while clashboard's dev server does — there is no daemon and nothing will come up behind you.

Three things you must not do instead:

- **Do not queue the work.** There is nowhere to queue it. Planning for twenty minutes into a socket that is refusing connections loses all of it.
- **Do not write `~/.clashboard/gantt/` directly.** Those files are the chart, and reaching them past the API bypasses the schema validation, the per-chart write queue that makes read-modify-write atomic, and the changelog the user relies on to see what you have been doing. A chart you corrupt that way reads as _missing_, which on a plan nobody has another copy of is the worst available outcome.
- **Do not retry in a loop.** Connection-refused is not a transient error here; it means the process is not running.

A `curl` that answers with an HTTP status — any status, including `404` and `500` — means the server _is_ running. That is a different situation, and "Reading an error" below is how you handle it.

## Your chart

- Base URL: `{{BASE_URL}}`
- Chart id: `{{CHART_ID}}`

Every path below is relative to `{{BASE_URL}}`, and every `curl` is written against your chart. Start by reading it:

```bash
curl -s {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}
```

## What a chart is

`GET /api/gantt/charts/{{CHART_ID}}` answers with the whole chart except its bodies:

| field          | what it is                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `version`      | the chart format, always `1`. Server-owned.                                                         |
| `id`           | the chart's slug, and the name of its folder on disk. Not patchable.                                |
| `title`        | what the chart is called. Patchable.                                                                |
| `jiraSources`  | epic keys, as an array of strings — `["GEO-120"]`, never a JQL string. The server builds the query. |
| `lastSyncedAt` | an ISO instant, or `null` if the chart has never synced. Server-owned.                              |
| `createdAt`    | an ISO instant. Server-owned.                                                                       |
| `nodes`        | every lane, **flat**, each carrying a `parentId`. The tree is built from those, not from nesting.   |
| `edges`        | every arrow.                                                                                        |

Each node in that response also carries **`hasBody`** — `true` when a markdown body exists for it. It is derived from the file being there, is not a field you can set, and is how you tell "this lane has an empty PRD" from "this lane has no PRD" without a second request.

Nodes arrive flat and you build the tree yourself from `parentId`. Depth is unbounded: a PRD lane holds feature lanes which hold task lanes, as deep as your plan goes.

## A node, field by field

```json
{
  "id": "tier-migration",
  "parentId": null,
  "order": 0,
  "title": "Tier migration",
  "source": { "kind": "local" },
  "start": "2026-01-05",
  "end": "2026-03-27",
  "column": "In Implementation",
  "status": null,
  "assignee": null,
  "discovered": false,
  "orphaned": false
}
```

- **`id`** — a slug you choose (see below). Unique within the chart. It is the handle you use in every later call, and it is also the filename of this lane's body.
- **`parentId`** — the id of the lane this one sits under, or `null` for a root lane. Reparenting is a `PATCH` of this field.
- **`order`** — an integer that orders a lane among its siblings. Gaps are fine; leave room (`0`, `10`, `20`) if you expect to insert.
- **`title`** — one line, 1–300 characters, and it is **trimmed**, so a title of only whitespace is rejected.
- **`source`** — `{ "kind": "local" }` for a lane you author, or `{ "kind": "jira", "key": "GEO-134" }` for one that mirrors a ticket. It decides which half of the node you own; see "Mirrored fields" below. You cannot change it after the node exists: a different source is a different node.
- **`start`** / **`end`** — `YYYY-MM-DD` or `null`. Chart-owned on every node, whatever its source. clashboard reads no dates from Jira and writes none back. Where each one comes from is **"How to date a lane"** below; the format is the easy half.
- **`column`** — the progress column, one of `"TO DO"`, `"In Implementation"`, `"In Code Review"`, `"Done"`. Note the casing: `"TO DO"` is upper-case and the other three are not. For a jira node it is derived from the ticket's status; for a local one you declare it. It is not nullable — `POST /nodes` defaults it to `"TO DO"` — so every lane carries one whether or not you thought about it, and **a lane with children does not render its own**. The chart tones only leaves; a parent draws the distribution of its leaf descendants instead ("7 of 11 done"). So the `column` on a PRD lane is stored, is never drawn, and is not worth agonising over: declare the one that reads best beside the others and spend the minute on a date instead.
- **`status`** — the real status name behind the column (`"In STG"`, `"Reviewed"`), or `null`. Mirrored on a jira node; usually `null` on a local one.
- **`assignee`** — a display name, or `null`. Mirrored on a jira node.
- **`discovered`** — `true` once a discovery search over the chart's `jiraSources` has returned this node's key. Set by sync, never by you, and absent from every request body. It is **not** "is in the epic" — that is what `orphaned` answers — it is "was this key ever in scope at all", and it is sticky: once true it stays true. A jira node you create yourself with `POST /nodes` starts `false`, and that is what makes **"A blocker that lives in another epic"** below possible at all.
- **`orphaned`** — `true` when sync found that this node's Jira key has left the epic. Set by sync, never by you, and absent from every request body. Only a node whose `discovered` is `true` can ever be marked: a key that was never in a search cannot be reported as having departed. A departed ticket is **marked, not removed**, because it may carry local children, a body, arrows and dates.

There is no `blocked` field and no percent. Blocked is derived from the arrows at read time, so it cannot go stale when the blocker ships, and a parent lane summarises its descendants as a distribution ("7 of 11 done") rather than as one averaged state.

## An edge, field by field

```json
{
  "id": "api-blocks-tier-migration",
  "from": "gantt-api",
  "to": "tier-migration",
  "source": { "kind": "local" }
}
```

- **`id`** — a slug you choose. Unique within the chart.
- **`from`** / **`to`** — node ids. Every edge means exactly one thing: **`from` blocks `to`**. There is no relation to pick.
- **`source`** — `{ "kind": "local" }` for a dependency you declare, or `{ "kind": "jira", "linkId": "10432" }` for one mirrored from a Jira issue link. Default `local`, and `local` is the common case: the dependency an architect knows about is frequently not linked in Jira at all — including between two Jira tickets.

Both endpoints must already be nodes in the chart. An edge naming a node that is not there is refused, because the chart cannot draw an arrow to nothing.

**A dependency is identified by its `from`/`to` pair, not by its `id`.** The id is only the handle you delete it by. A second edge over a pair the chart already has is refused with `409`, whatever id you give it and whatever `source` — including a `local` edge over a pair already mirrored as `jira`, which is the common case, because bootstrap mirrors every Jira link before you start. **Read the chart's `edges` before you declare one**, and treat a `409` naming an incumbent id you did not send as "already declared, move on", not as "rename and retry". The reverse pair is a different dependency and is accepted: `A blocks B` plus `B blocks A` is a cycle, and a cycle is recorded rather than refused — see below.

## Ids are slugs you choose

Chart ids, node ids and edge ids all match `^[a-z0-9][a-z0-9-]{0,63}$` — lowercase letters, digits and hyphens, starting with a letter or digit, at most 64 characters.

You pick them, and you should pick them to be readable: `tier-migration`, not `n-7f3a91`. You will be addressing these across many turns and you need to be able to reconstruct them from the plan rather than from a map you are carrying. A jira node conventionally takes its lowercased key — `geo-134`.

**A node id is also its body's filename.** The body of `tier-migration` lives at `bodies/tier-migration.md`, which is why the charset is this narrow: it is the guard that keeps an id out of the filesystem's business.

## Dates

`start` and `end` are `YYYY-MM-DD` strings, or `null`. The month and the day are range-checked, so `2026-13-01` comes back as an error you can correct rather than as a bar in the wrong year.

They are nullable because a chart bootstrapped from Jira has one node per discovered ticket and no dates at all. **Do not invent dates to fill them in.** A parent carries its own declared window _and_ an underlay derived from its dated descendants, which is what makes slip visible — a PRD whose features have overrun its declared quarter shows the overrun instead of absorbing it.

An undated leaf lane is drawn as a **ghost**: one week, placed behind whatever blocks it, in a dashed outline with no fill. That is the _reader's_ view inventing a position so the lane has somewhere to sit on the time axis, and it is drawn as visibly invented for exactly that reason. **It is not a date and it is not on the chart** — `start` and `end` stay `null` in the file, the lane is still counted as undated in "needs attention", and a `GET` will hand you back the nulls. Do not read a chart, see bars everywhere, and conclude the dating is done.

That is not permission to leave a chart blank, though. Most of a real chart's dates are already knowable, and the next section is where each one comes from.

## How to date a lane

This is the section whose absence produced a chart of **29 lanes with no dates at all** — correctly parented, every one of its 53 arrows reconciled, and `start: null, end: null` on all twenty-nine. The agent that built it did nothing wrong: it had been taught the date _format_ and never told where a date comes from. A schema is not a procedure. This is the procedure.

### 1. Ask the server for the history first

```bash
curl -s -X POST {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/dates
```

`200` with the whole chart. **No request body**: the ticket keys it needs are already on the chart, exactly as with `sync`.

It reads each mirrored ticket's **status transition history** and dates every lane whose ticket has already started — `start` from the first transition into a status outside the `TO DO` column, `end` from the first transition into a status in the `Done` column. That is the only truthful source of dates in existence for work that has already happened, and clashboard has to be the one to read it: it holds the Jira credentials, and `acli jira workitem view --json` returns no transitions at all.

**Call this straight after creating a chart from epics, before you date anything by hand.** Two properties make that safe, and an agent that doubts either will put the call off forever:

- **It only fills blanks.** A `start` or an `end` already on a lane keeps its value even where history disagrees. There is no path through the verb that can overwrite a date, so it is a source of a first value and never a second writer — it cannot undo your planning, and you are not racing it.
- **It is safe to re-run.** A second call finds nothing left to fill and reports the same chart the same way. Run it again after a `sync` that discovered new tickets.

On the chart described above it dated 20 of the 29 lanes in under two seconds. Skipping it costs you all twenty and buys nothing.

`404 ChartNotFound` comes back before Jira is asked, so a mistyped chart id is cheap. `503 JiraUnreachable` means Jira answered for **none** of the chart's tickets and `chart.json` was left byte-identical; try later. One ticket Jira will not answer for is not a `503` — it is skipped and counted, and the other lanes still get their dates.

### 2. What it leaves for you

Three kinds of lane come back still blank, and they are the same three every time:

- a ticket that **has not started** — history has nothing to say about the future;
- the **forecast end of work still in flight** — it gets a real `start` and `end` stays `null`;
- **the lanes you authored yourself** — a PRD, a feature, an issue has no Jira history to read.

On that chart it was 4, 4 and 5. All three are judgement, which is precisely why the server does not guess at them — a date it invented would be indistinguishable from one you reasoned about.

### 3. Forecasting an end for work in flight

Take the `start` the seed gave you, add the remaining effort you can justify, and **say in the lane's body where the number came from**.

**Be straight about what you cannot see.** `POST …/dates` reads two transitions and only two: the first one out of the `TO DO` column and the first one into `Done`. Nothing in it — and nothing in any source this document endorses — measures how long a ticket has sat in code review or how much of it is left. For a lane in `"In Code Review"` the remaining effort is therefore **unobservable**, and that is precisely where an agent fabricates: three of the four forecasts on the first real chart rested on a number nobody had. Put the assumption in the body as an assumption — "in review since the 12th; remaining effort not observable, assumed two days" — rather than converting it into a date and letting the bar assert it as a fact.

**And when `start` plus the effort lands before today, do not write it.** An `end` in the past on a lane that is not `Done` is a bar claiming the work finished, contradicted by the column beside it; it is also the arithmetic telling you the estimate has already been spent, which is a result and not a rounding error. There are two honest moves and no third: leave `end` null, or forecast **from today forward** — today plus whatever you can justify is left — and say in the body that the original estimate was exceeded. Prefer the first whenever nothing bounds the remainder, which for a lane in review is most of the time.

If you cannot justify one, **leave `end` null**. A lane with a start and no end draws as an **open-ended bar** that fades out instead of stopping, and what it says is true: this began on a known day and nobody has forecast a finish. That is a legitimate outcome and not a gap in your work. An invented end is a confident wrong date a reader has no way to tell from a real one, and it is the one mistake here that cannot be spotted from the chart.

### 4. Dating work that has not started

Schedule it from the dependency graph **the chart already holds**. A lane you are placing starts no earlier than the latest `end` of everything with a `blocks` edge into it, so: `GET` the chart, read its `edges`, and work forward from the lanes history has already dated. Do not go back to Jira for this — the arrows are on the chart, and the read is cheap because no bodies travel with it.

**That is a rule for scheduling forward. It is not an invariant of the chart, and you must not apply it backwards.** A date that came from history is a _measurement_, and real work overlaps its blockers constantly: on the chart this section was written from, six arrows run out of a lane that ended later into a lane that started earlier — every one of them between two finished lanes, and every one of them correct, because the epic itself says the component tickets could start on the foundation ticket's branch as soon as the types were stable and before it merged. **Where an observed date and an arrow disagree, the observed date wins.** The arrow is still right too; the dependency was real. Leave both alone. An agent that "tidied" those dates to satisfy the arrows would have replaced the record of a project with an idealisation of it, in the one place the record is kept.

Where a ticket states its own sequencing in prose, that is a dependency too and it belongs on the chart as an arrow — and the ones worth hunting are the ones Jira has no link for. On the epic this document keeps citing, all 53 mirrored links reconciled exactly with the blocked-by column of the epic's own table, so re-reading the child tickets for dependencies _between_ them found nothing at all. The dependency that genuinely was missing pointed **out of the epic**: the epic's sources-of-truth table names `HDR-19244`, the backend API contract, as the thing its release waits on, and no issue link anywhere says so. That is the arrow worth your time, and **"A blocker that lives in another epic"** below is how to put it on the chart.

### 5. Duration, and where the estimates actually are

**Read the epic's own description before you reach for a ticket field.** On the chart this document was written from, not one of the 29 tickets carried an estimate of any kind — and the epic's description carried all of them, as a markdown table with a day figure per ticket, beside the grouping the lanes ended up using and the entire blocked-by matrix. The epic key is sitting in the chart's `jiraSources` and nothing else here tells you to open it. Open it first: it is frequently the only place the plan is written down at all.

Two things about reading it. `acli jira workitem view HDR-20708 --json` returns the description as **ADF** — a nested `{ type, content }` document, not text — so you have to walk that tree to get the table out, and writing the walker comes before reading the one document that mattered. And that call hands back a handful of fields only (summary, status, assignee, issuetype, description): no estimate field comes back at all, and asking a search for one is refused outright. So "this ticket carries no estimate" is not something `acli` can tell you; it is something you find out by reading the epic.

Use the estimate you found, wherever you found it. If there is none anywhere, pick a default, **apply it consistently, and record it in the body of every lane you applied it to** — "no estimate on this ticket; assumed two weeks" is one line.

A stated assumption is something a human can correct in a sentence. An unstated one is something they have to reverse-engineer from the bar widths, and mostly they will not try.

### 6. Date your own PRD lanes too

The lanes you authored need dates as much as the mirrored ones, and on the real chart they were the five that got missed: dated nowhere while their Jira children were dated from history, so each parent drew the thin derived underlay and no bar of its own.

A parent carries its **own declared span** on purpose. That is what lets "this PRD is Q4" exist before the PRD has been decomposed, and it is what makes the child-span underlay mean anything at all — an overrun is only visible when there is a declared window to overrun. So declare the window you actually mean, and let the underlay disagree with it if the children have slipped. The disagreement is the chart doing its job.

**When there is no baseline at all** — no sprint, no due date, nothing anybody committed to — the only window you can honestly declare is the span your dated children already imply, so declare that, and say in the body that it is derived rather than agreed. The underlay then matches the bar exactly and tells a reader nothing on the day you write it, which is the correct amount: it starts meaning something the moment a child runs past it, and a parent with no bar at all would never mean anything. What you must not do is invent a rounder window — "Q4" over children that end in mid-November — because an overrun measured against a window nobody agreed to is a false negative that looks like reassurance.

### 7. Never leave a chart silently undated

If you finish and lanes are still undated, **say which, and why**, in your reply. One clause each is enough: "GEO-210 and GEO-211 have no start because nothing has begun on them and nothing dates their blockers yet."

An undated chart renders as a grid of ghost bars all stacked on today, and the person who asked for it cannot tell your judgement from your omission. The chart is on your side here — it carries a "needs attention" line counting the undated lanes and the ones in flight with no forecast end, and a chart with nothing dated at all shows a banner naming this very verb. Both exist so the gap is visible; do not make them the way the user finds out.

## Mirrored fields must not be patched on a jira node

On a node whose `source.kind` is `"jira"`, four fields are **mirrored** from the ticket:

```
title   column   status   assignee
```

A `PATCH` naming any of them on such a node comes back **`422 MirroredFieldPatch`**. This is not pedantry: **sync owns those fields and the next sync would overwrite whatever you wrote**, so accepting the write would be a lie. If a mirrored value is wrong, fix it in Jira and sync.

Everything else is chart-owned on **every** node regardless of source — `parentId`, `order`, `start`, `end`, its arrows and its body. Patching those on a jira node is entirely normal and is most of what you will do: grouping mirrored tickets under your own PRD lanes is the arrangement this feature exists for.

The same `PATCH` against a `local` node is fine. There, `title`, `column`, `status` and `assignee` are yours.

## Reading

```bash
curl -s {{BASE_URL}}/api/gantt/charts
```

`200`, `{ "charts": [ … ] }` — every chart with its id, title, `jiraSources`, `lastSyncedAt` and two counts. This is also the probe.

```bash
curl -s {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}
```

`200`, the chart as described above. `404 ChartNotFound` if there is no such chart. Cheap: no bodies travel with it, so look a node id up here freely.

```bash
curl -s {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/nodes/tier-migration/body
```

`200` with `Content-Type: text/markdown` — **the body itself, not JSON**. A node with no body answers `200` with an empty document; the node existing is what the status means, and `hasBody` on the chart read is how you tell empty from absent. `404 NodeNotFound` for a node that is not there.

```bash
curl -s "{{BASE_URL}}/api/gantt/skill?chart={{CHART_ID}}"
```

`200`, `text/markdown` — this document, with the base URL and chart id substituted. You already have it; it is here so you can re-fetch it rather than re-derive it.

## Writing

### Create a chart

```bash
curl -s -X POST {{BASE_URL}}/api/gantt/charts \
  -H 'Content-Type: application/json' \
  -d '{"id":"tier-migration-plan","title":"Tier migration","jiraSources":["GEO-120"]}'
```

`201` with the whole new chart, in the shape a chart read has, `hasBody` included. `jiraSources` may be omitted and defaults to `[]`; naming epics there makes the server **bootstrap** the chart, and bootstrap fills in **two** things rather than one: one mirrored node per discovered ticket, flat and undated — and **one `jira` edge for every `blocks` link between two of those tickets**.

That second half is the one an agent reading the node count never notices. The first real chart came back with 29 lanes and **53 edges already on it**, every one mirrored from `issuelinks`, before anybody had declared a thing. A whole epic's links arrive in the same search as its tickets, so mirroring them costs nothing, and leaving them out would make you re-declare by hand a graph Jira already has. **So the chart has arrows before you write one.** Read its `edges` before you declare a dependency and expect most of what the epic's blocked-by column states to be there already; a pair that is there answers `409` naming the incumbent, which means "already declared", not "retry under another id".

What bootstrap does **not** do is group. Jira's parent is read once, as a suggestion, and on the single-epic case this document is written for it suggests nothing at all: every discovered ticket's parent is the epic, the epic is not a lane, and so **every lane arrives at the root** — all 29 of them. (It places a child only where that child's Jira parent is itself a discovered ticket: a sub-task under a discovered story, or a second `jiraSources` entry that is a child of the first.) Grouping is yours and it is step 4 of "How to work".

Creating the nodes yourself instead was rejected deliberately: forty round-trips to create forty nodes you did not read is worse than one call, and what is left for you is the part that needs judgement — grouping, dating, the arrows Jira does not have, the bodies. `409 DuplicateChartId` if the id is taken.

### Rename a chart, or change its epics

```bash
curl -s -X PATCH {{BASE_URL}}/api/gantt/charts/{{CHART_ID}} \
  -H 'Content-Type: application/json' \
  -d '{"title":"Tier migration — Q1","jiraSources":["GEO-120","GEO-210"]}'
```

`200` with the updated chart. Both fields are optional; `id`, `version` and `createdAt` are identity and history and none is patchable. Nodes and edges have their own endpoints — there is no whole-chart write, so two agents touching different lanes both simply succeed.

### Refresh the mirrored half

```bash
curl -s -X POST {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/sync
```

`200` with the whole synced chart. No request body: the epic keys are already on the chart. Call this before reading if you want current Jira state — a `GET` never syncs, so a cheap id lookup never costs a Jira round-trip.

Sync **refreshes** mirrored fields, **adds** newly discovered keys as flat undated nodes, and **marks** departures `orphaned`. It never moves a node, never deletes one, and never touches a date. `503 JiraUnreachable` means Jira did not answer and the chart was left byte-identical; try later.

It reconciles the **mirrored** arrows too, and only those. A `blocks` link that has appeared since the last sync arrives as a new `jira` edge. A `local` edge whose pair Jira now reports as a real link is **promoted** to `jira` rather than drawn a second time. And a `jira` edge whose link has gone is removed **only when both of its endpoints' keys came back in that same search** — a link that vanished between a ticket in the epic and one outside it is absence of evidence rather than evidence of absence. **A `local` edge is never removed by sync**, which is what makes the dependency you declared yours rather than Jira's to withdraw.

### Add a lane

```bash
curl -s -X POST {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/nodes \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "tier-migration",
    "parentId": null,
    "order": 0,
    "title": "Tier migration",
    "source": { "kind": "local" },
    "start": "2026-01-05",
    "end": "2026-03-27",
    "column": "TO DO",
    "status": null,
    "assignee": null
  }'
```

`201` with the created node. Only `id` and `title` are required; everything else defaults to the values shown (`parentId: null`, `order: 0`, a `local` source, no dates, `"TO DO"`, no status, no assignee). `orphaned` is not accepted — it is a fact sync observes, not a claim you make.

`409 DuplicateNodeId` if the id is taken. `404 NodeNotFound` if `parentId` names a lane that is not in the chart.

### A blocker that lives in another epic

A front-end epic usually waits on a gate that is not in it: a backend contract, a platform upgrade, another team's release. Model it as **the real ticket** — a node whose `source` is `{ "kind": "jira", "key": "HDR-19244" }`, id `hdr-19244`, parented wherever the waiting happens — and then declare the edge from it into whatever it gates, exactly as you would between two lanes inside the epic.

What makes that safe is `discovered`. The node starts `false`, because no discovery search over this chart's `jiraSources` ever returned its key, and sync marks a node `orphaned` only on the strength of a search it was absent from — so **this lane is never orphaned**, however often you sync. It is still a real ticket, so sync keeps its `title`, `column`, `status` and `assignee` current by reading it **by key**; that read is not a search, so it adds no lanes, carries no links and never flips `discovered`. If a real Jira link to it turns up later, the next sync mirrors it and promotes your local edge over the same pair rather than doubling it.

The substitute an agent reaches for when it does not know this — a `local` lane with the key in its title and the ticket's status hand-copied into `status` — is wrong in the way nobody notices: correct on the day it is written and stale forever after, with no sync that will ever fix it or say that it needs fixing.

### Move, date or retitle a lane

```bash
curl -s -X PATCH {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/nodes/geo-134 \
  -H 'Content-Type: application/json' \
  -d '{"parentId":"tier-migration","order":10,"start":"2026-01-19","end":"2026-02-13"}'
```

`200` with the updated node. Every field is optional and only the ones you name change; `id` and `source` are absent from the body because changing either would be a different node. On a jira node, naming `title`, `column`, `status` or `assignee` is the `422` above.

### Write a lane's body

**This is the one route that does not take JSON.** The body travels as **raw markdown in the request body**, in both directions — there is no JSON field to put it in and nothing to escape:

```bash
curl -s -X PUT {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/nodes/tier-migration/body \
  -H 'Content-Type: text/markdown' \
  --data-binary @prd-tier-migration.md
```

`200` with `{ "chartId": …, "nodeId": …, "snapshotted": true }`. Every other verb on this surface takes JSON, so the instinct is to wrap the markdown in `{"body": "…"}` — **do not**. JSON-escaping a two-hundred-line PRD into one string field is the step that goes wrong most often, and the route would reject the object as not being your document.

**Error bodies on this route are still JSON**, like everywhere else. Only the success payloads are markdown.

`snapshotted: true` means a previous body was kept as `bodies/<nodeId>.md.prev`. That is **one** level of undo, and it is the user's safety net for the only content in the chart that is genuinely irreplaceable. `snapshotted: false` means there was no previous body to keep, so nothing was displaced — the ordinary answer for the first `PUT` to a lane, and not a warning about anything. Read before you overwrite:

```bash
curl -s {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/nodes/tier-migration/body
```

### Declare a dependency

```bash
curl -s -X POST {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/edges \
  -H 'Content-Type: application/json' \
  -d '{"id":"api-blocks-tier-migration","from":"gantt-api","to":"tier-migration","source":{"kind":"local"}}'
```

`201` with the created edge. `source` may be omitted and defaults to `{ "kind": "local" }`. `404 NodeNotFound` if either endpoint is not a node in the chart.

`409 DuplicateEdgeId` covers **both** refusals, and the message tells them apart. For a taken **id** it names the id you sent. For a `from`/`to` pair the chart already has it names the **incumbent** edge's id and the pair, because that dependency is already recorded and there is nothing to add under another id — do not retry it with a fresh id, which would double the arrow.

**An edge that closes a cycle is accepted, with a `201`.** The API never refuses to record a dependency you declared: a chart built incrementally will contain loops you mean to resolve two calls later, and a plan that is impossible should _look_ impossible rather than be impossible to write down. The chart then names the loop in a warning and draws its edges dashed, and every lane in it reads as unresolvable.

So a cycle is not an error to retry around — **it is a result about the plan.** If a cycle shows up and you did not intend one, fix the plan: withdraw the edge that is wrong, or reparent the lanes so the real ordering is expressible. Re-sending the same call will simply succeed again.

### Withdraw a dependency

```bash
curl -s -X DELETE {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/edges/api-blocks-tier-migration
```

`200` with the edge that was removed, so re-declaring it is a copy rather than a reconstruction. `404 EdgeNotFound` if it was not there.

### Remove a lane

```bash
curl -s -X DELETE {{BASE_URL}}/api/gantt/charts/{{CHART_ID}}/nodes/geo-134
```

`200` with `{ "chartId": …, "nodeId": …, "reparentedTo": …, "reparentedChildIds": [ … ], "removedEdgeIds": [ … ] }`.

Deleting a lane **reparents its children to its own parent** — it neither cascades nor orphans them — removes every edge touching it, and erases its body _and_ that body's `.md.prev`. The response names all three, because "what did that actually move" is the next question. A mistyped id here costs a PRD, so read the chart first.

## There is no way to delete a chart

**`DELETE /api/gantt/charts/:chartId` answers `405 MethodNotAllowed`, and that is not an oversight.** Do not look for another spelling of it, and do not approximate it by deleting every node. The refusal is written down rather than left to a missing handler precisely so you get a straight answer: an unhandled method here would fall through to the app's HTML and hand you a `200` you could mistake for a deletion that never happened.

Removing a chart is **archiving**, it moves the folder to `gantt/.archive/`, and it is a confirmed action the user takes in the UI. Single-writer is a rule about a chart's _contents_; a chart's _lifecycle_ is a different question, and the irreversible verb over the only copy of a quarter of planning belongs with a human rather than with a process acting on a paraphrased instruction.

If the user asks you to delete a chart, tell them it is theirs to archive in clashboard, and say where the button is.

## Reading an error

Every failure comes back as JSON, whatever the route:

```json
{
  "error": "InvalidChartPayload",
  "message": "the request body does not match the schema",
  "issues": [
    { "path": "start", "expected": "string matching /^\\d{4}-…/", "received": "\"March 2026\"" }
  ]
}
```

Read it in three parts:

- **The status is the category.** `400` the body or an id in the URL did not match the schema · `404` no such chart, node or edge · `409` an id you chose is taken, or a dependency you declared is already there · `422` you patched a mirrored field on a jira node · `503` Jira did not answer during a sync · `500` a bug on the server, which is not yours to fix.
- **`error` is the tag** — `InvalidChartPayload`, `ChartNotFound`, `NodeNotFound`, `EdgeNotFound`, `DuplicateChartId`, `DuplicateNodeId`, `DuplicateEdgeId`, `MirroredFieldPatch`, `JiraUnreachable`, `InternalError`. Switch on this, not on the prose.
- **`issues[]` names the field.** Each entry has a `path` addressing the field in the body you just sent (`nodes.2.start`, `source.kind`, or `(root)`), an `expected`, and the `received` value as the server saw it.

**A `400` is a correction, not a dead end.** `issues[0].path` tells you which field, `expected` tells you what it should have been, and `received` tells you what you actually sent — which is usually enough to see the mistake. Fix that field and send the call again. Do not fall back to writing files, and do not report the task as impossible on a `400`; a validation error is the API telling you precisely how to succeed.

`issues` is always present, even when it is empty, so you can read it without testing for the key.

## How to work

A chart is built in a handful of passes, and they are cheap because the chart read carries no bodies:

1. **Read the chart** before you write to it, every time you are not certain of its contents. You need the node ids anyway.
2. **Seed the dates from history** — one `POST …/dates`, immediately after a chart is created from epics and before you date anything by hand. It only fills blanks and is safe to re-run, so there is no version of this plan in which deferring it helps.
3. **Create the lanes you are adding**, parents before children, so `parentId` always names something that exists.
4. **Arrange** — `PATCH` `parentId` and `order` to group mirrored tickets under your own PRD lanes. This is the work the server cannot do for you.
5. **Date what the seed left** — the unstarted lanes, the forecast ends, and your own PRD lanes — with the epic's own description open, because that is usually where the estimates are. "How to date a lane" above is how, and leaving an `end` null is one of the answers.
6. **Declare the arrows Jira does not have.** Bootstrap already mirrored the ones it does, so read `edges` first and add only what is missing — then read the chart back and look at whether a cycle appeared.
7. **Write the bodies** last, one `PUT` per lane, as raw markdown.

Each write is one changelog entry the user will read. Make them mean something: a hundred single-field patches that end where three would have is a legible audit trail of you flailing.
