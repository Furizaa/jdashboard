# Explain explains: the model cell, and an altitude the schema enforces

The Explain surface stops **reviewing** a merge request and starts **explaining** it. Three things change: the agent's instructions are rewritten around "what does the system look like now" rather than "what is wrong with this"; the cell vocabulary gains a **`model`** cell — the domain's types and how they relate, drawn as an entity-relationship diagram from **data the agent sends** rather than mermaid it writes; and findings **sink** to the bottom of every page, so no page can open with a warning.

This **amends ADR-0009 §7 and ADR-0010 §5**. The surface, the tabs, the run registry, the SSE channel, the worktree, the read-only posture, the move chaptering and the rail are all unchanged. The report version **stays 2**: a new cell type is additive, every report already on disk still validates, and nothing that reads one needs to know about it until an agent writes one.

The driver is that the shipped feature produced code reviews. Asked to explain a merge request adding thirteen `@sdk/usergroup` domain types and the service over them, it returned prose about a payload-resolver helper's type gymnastics, a hunk of that helper, and a `medium` finding against it — accurate, and not the question. The architect reading it wanted the thirteen types and their relationships, which is to say a picture, and the report had no way to give them one.

Three separate things caused that, and only the first is a prompt problem:

1. **The instructions asked for a review.** The skill opened with "You review one merge request", the prompt with "Review the merge request below", and four of the five questions it posed — contracts, blast radius, does-the-shape-fit, plus the findings apparatus — are risk questions. One was explanatory.
2. **The schema could not express a model.** Nine cells, of which `verdict`, `finding`, `blast-radius`, `questions` and `unverified` are risk-shaped. The domain's shape had no cell at all: the agent's only outlets were prose or a hand-written mermaid string. The schema's own comment says altitude is enforced by what it cannot express — and what it could not express was the thing the reader wanted most.
3. **An ER diagram was not reachable even in principle.** The skill named three permitted diagram kinds — `flowchart`, `sequenceDiagram`, `stateDiagram-v2` — and `erDiagram` was not among them. It also framed diagrams as an exception ("only when the move is structural… never draw one just to have one") and placed them _after_ the diff in the prescribed cell order, so an agent that filled prose and a hunk had already done what it was told.

The ultimate driver is ADR-0010's own lesson one level further: when the agent's output is a typed domain object, **the shape of that object is where the product decisions live**. "Explain the model" as a sentence in a prompt is a request. `model.entities[].kind` as a required field is a fact the report cannot omit.

## Considered options

### 1. Where the fix goes

- **(a) The skill only.** Reframe the five questions, add `erDiagram` to the permitted kinds, promote the diagram above the diff, and brief the narrative cell. _Rejected as sufficient_ — though all of it is done anyway, because it is right. On its own it leaves the agent free to skip the picture on exactly the merge requests that need it, which is the behaviour already observed: the previous skill also asked for architect altitude, in detail, and got hunks. A prompt that asks for something the schema does not require is a prompt that will sometimes be ignored, and "sometimes" is not a property worth shipping twice.

- **(b) The skill, plus a typed `model` cell.** _Selected._ The reframing lands where it belongs, and the one thing the report could not say becomes a thing it has a field for. The cell is also where the altitude rule can be made structural rather than hortatory: a model cannot be expressed without saying which of its types are new.

- **(c) (b), plus moving findings out of move pages entirely** into one risk section in the overview. _Rejected._ It is the strongest possible statement that this is not a review tool, and it costs the thing findings are actually worth: a finding is only useful next to the move that caused it. The reader would have to navigate away from the explanation to learn what was wrong with it, and then back. The weaker, cheaper version of the same idea — findings stay on the page but always below the explanation (§4) — gets most of the benefit and none of that cost.

### 2. The model cell carries data, not a drawing

The agent could send mermaid (`{ type: 'diagram', mermaid: 'erDiagram…' }`, which already renders) or it could send entities and relations for us to draw.

- **(a) Free-form mermaid in the existing `diagram` cell.** _Rejected_, and it is the option that looks free. Mermaid's ER grammar is far narrower than its documentation says, and it is narrow in exactly the places a TypeScript domain lives. Checked against the installed mermaid (12.0.0) rather than the docs:
  - An **attribute word** — a field's type and its name — matches `[*A-Za-z_][A-Za-z0-9\-_[\]().,*]*`. No spaces, no `<`, no `|`. So `Record<string, Member>`, `string | null` and `readonly Member[]` are all parse errors, and generics have to be spelled `Record~string,Member~`. The published documentation says a type "must begin with an alphabetic character" and does not mention the rest.
  - A **relation label must be quoted.** Unquoted, `one` and `many` are cardinality keywords: `: one` fails, `: "one"` is fine. An agent describing a one-to-many relationship writes the former.
  - A **quoted string** may not contain `%` or a backslash — not as escapes, as syntax errors.

  A diagram that fails to parse renders as its own source text, which is the correct fallback and an indistinguishable outcome from the agent never having drawn one. Worse, the failure is silent to the agent, so nothing in the loop can learn from it.

- **(b) A typed `model` cell the view draws.** _Selected._ `{ entities: [{ name, kind, note?, fields: [{ name, type, note? }] }], relations: [{ from, to, cardinality, label }] }`, and `domain/model-diagram` generates the `erDiagram`. Three things follow, in increasing order of importance:
  - **It cannot fail to draw for syntactic reasons.** Types are rewritten rather than rejected — `Record<string, Member>` becomes `Record~string,Member~`, `string | null` becomes `string-or-null`, `readonly Foo[]` becomes `readonly_Foo[]` — labels are always quoted, and names go through mermaid's alias form (`e1["@sdk/usergroup"]`) so the picture can use the name the code uses, slashes and spaces and all.
  - **Every model in every report is drawn the same way.** Layout, colour and the entity-kind styling are ours, not a property of how well the agent writes mermaid that day.
  - **The schema can hold the agent to the altitude.** A relation to a type the cell never described is rejected, so a model cannot have edges into the void; and `kind` is required, which a mermaid string could never have asked for.

  The cost is a generator with sanitising rules in it, which is a real cost. It is paid in one pure function with a table-driven test, and the rules it encodes were each verified against the installed renderer.

### 3. `kind` is required; cardinality has one axis

- **`kind` — `added | changed | existing` — is required on every entity.** "Which of these types are new" is the first question an architect asks of a model, and it is the one fact the picture genuinely cannot carry: a box looks the same either way. It is rendered twice, as the entity's outline colour (reusing the hexes behind `SystemsBlock`'s badges, so "this is new" reads the same everywhere in the report) and as a badge in the cell's **legend**. The legend is not decoration — it carries the kind and the entity's one-line `note`, and it is what remains when mermaid fails for a reason sanitising cannot fix, which is the difference between a degraded cell and an empty one.

- **`fields` is optional and `relations` may be empty.** An `existing` type included so a relation has somewhere to land does not need its shape restated, and one new value object with no relations is still a model. Requiring either would force invention, which is the failure mode a required field is supposed to prevent.

- **Cardinality is multiplicity only**: `one-to-one`, `one-to-many`, `many-to-many`, `one-to-optional`. _Rejected — a second axis for identifying vs. referencing_ (mermaid's solid `--` against dashed `..`). It is a real distinction in domain modelling and it is one an agent gets wrong more often than right, where the relation's `label` — "contains", "resolves to", "is keyed by" — carries the same information in words the reader can check.

### 4. Findings sink

`layOutReport` used to lift the findings to **the position of the first one**, so that a narrative introducing them stayed above and a blast-radius table following them stayed below. It now puts every explanatory cell first in the agent's own order, then the findings (still grouped by system, worst-hit system first), then `unverified`.

The old rule's reasoning was sound about cells and wrong about the page: it let a move page open with a warning, and **a page that opens with a warning is a code review**, whatever the cells under it say. The explanation is the deliverable here and a finding is a footnote on it, so the one thing the view re-orders is where the footnotes go.

`unverified` stays last because it is the report's caveat rather than part of what it found, and it is the only cell whose position the skill already pinned. Everything else keeps the agent's order: re-sorting the argument itself would be the view second-guessing the report's structure, which that function's own comment forbids.

- _Rejected — leave the placement alone and only change the skill._ The skill does now say findings come last, and the agent will mostly comply. The view enforcing it costs four lines and removes the failure mode entirely, and the function was already in the business of overriding the agent's finding order.

### 5. No new report version

`version` stays `2`. A new arm on the cell union is additive: every v2 report on disk still validates, `renderBlock` gains an arm under the same `ts-pattern.exhaustive()` invariant — adding the type was a compile error until it had a renderer — and nothing persisted needs rewriting.

- _Rejected — bump to 3._ It would be defensible, since the agent's output does change shape. But ADR-0010's no-shim rule means a version bump makes every open tab read `interrupted — re-run`, and the version exists to protect readers from reports they cannot render. A v2 report without a `model` cell renders perfectly. Bumping would be a cost with no reader to protect.

## Consequences

- **A tenth cell, `model`,** in the schema, the kernel, the skill and `renderBlock`. `MODEL_ENTITY_KINDS` and `MODEL_CARDINALITIES` join the other exported vocabularies.
- **`domain/model-diagram`** owns one pure function, `mermaidForModel(block, styles)`. The palette is a **parameter**: hex colours live in the view beside the rest of the mermaid theme, not in the domain.
- **`MermaidFigure`** is extracted from `DiagramBlock` — the lazy import, the `securityLevel: 'strict'` render, the thumbnail, the expand control and the overlay — and both drawing cells use it. A model opens into the same pannable overlay a diagram does, which a model of a dozen entities needs more than a flowchart ever did.
- **The skill is rewritten, not patched.** It now opens with "You explain one merge request", orders the work as group → explain → judge, bans "What changed" as a narrative title, demotes `diff` to evidence with a cap of two or three hunks per move, and makes `model` the default cell for any move that adds, renames or reshapes domain types. `erDiagram` is explicitly **not** to be hand-written in a `diagram` cell.
- **The prompt matches.** "Explain the merge request below to the architect of the system it lands in", and in as many words: "You are not reviewing it."
- **A move page can no longer open with a finding,** and a report whose only observations are nits is now explicitly a `sound` verdict with no findings.
- **The dev-server note in `CONTEXT.md` applies.** The report schema changed, so the pinned run registry must be restarted before a re-run will validate against it.
- **The skill is half of the report contract, and only the other half is type-checked.** The schema says what a cell may be; the skill is the **only** place the agent learns a cell's field names. Rewriting the skill dropped the one worked example of a `diagram` cell, leaving its payload described as "Mermaid source" with the field `mermaid` never written down anywhere — and the next run against a real merge request invented a key and was rejected at the boundary (`moves.1.blocks.1.mermaid: expected string, received undefined`), losing twenty minutes of agent time. Both drawing cells now carry a worked JSON example in their own section, the field rules name `diagram.mermaid` and `narrative.body` explicitly, and `explain-skill.test.ts` holds the two halves against each other. `EXPLAIN_SKILL_PATH` moved to `explain-agent.ts` so the test and the registry share one source of truth — the argv, the prompt and the instructions are one concern.
- **A rejected report is lost whole.** One bad cell in one move cost the entire run, which is the documented behaviour (validated once, at the boundary) and the right trade for a typed pane — but it is also why the guard above is a test rather than a note.

## Tests

| Layer              | How                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report schema      | The existing cell table, extended with a `model` cell, plus its own block: the `fields`/`relations` defaults, a missing or unknown `kind`, no entities, a duplicate entity name, an unknown cardinality, a relation end that is not an entity of the cell (by message and by path), and a TypeScript type surviving verbatim.                                                                        |
| `model-diagram.ts` | Pure and table-driven over the rewrites, each expectation citing the grammar rule it pins: the type table, the unbalanced-tilde case, a leading digit, an all-punctuation fallback, every cardinality symbol, the always-quoted label, `%`/quote/backslash stripping, and the per-kind `classDef`/`class` grouping.                                                                                  |
| `block-altitude`   | Extended over sinking: findings below the explanation with the agent's order kept above them, a single finding sinking too, `unverified` staying last, and identity returned for a page already laid out this way.                                                                                                                                                                                   |
| Cell renderers     | The existing snapshot over the v2 fixture, which now carries a `model` cell, plus one asserting the legend renders while the diagram is still loading — the degraded-cell path.                                                                                                                                                                                                                      |
| Skill contract     | `explain-skill.test.ts` walks the cell union by introspection and asserts the skill names every type and every **required** field of each. Added after the rewrite dropped the `diagram` cell's worked example and the next real run was rejected for a `mermaid` field the instructions no longer mentioned — see Consequences.                                                                     |
| End-to-end         | The stub's report carries a model cell **deliberately full of what the ER grammar rejects** — an angle-bracket generic, a pipe union, a space in a type, a `%` in a name, a relation labelled `one`. A `ready` status in a real browser is the only proof the sanitising actually works. Plus the legend's three kinds, the overlay, and an assertion that the finding is the last cell on the page. |

Note that the two diagram locators in the Explain spec are now scoped to their cell: a move page carries two figures, so an unscoped `explainDiagram` would match both.

## References

- ADR-0009 — the Explain surface. This ADR amends its §7 (the report is a typed block document, and the altitude rules in it).
- ADR-0010 — the chaptered report. This ADR amends its §5: the cell union grows, which that section left open as a change to be made "later from evidence". This is the evidence.
- ADR-0006 — binary stream API routes; unchanged, but the SSE channel is what makes a 20-minute run watchable and therefore what makes a richer report affordable.
