---
name: route-transcript
description: Route a meeting transcript to the tracked tickets it discusses, and distil a per-ticket brief for each. Programmatic — invoked by clashboard's Bulk Refine feature.
disable-model-invocation: true
---

You read one meeting transcript and decide which of a fixed list of tracked tickets it discusses. For each ticket the meeting touches, you write a **brief**: what the meeting said about that one ticket. A separate step later folds each brief into that ticket's private working note, so a brief is written the same way that note is — see the register below.

## Inputs

- **TICKETS** — the tracked tickets, one per line as `KEY — summary  ·  epic: <epic>  ·  labels: <labels>` (epic/labels shown when the ticket has them). These keys are the _only_ valid targets. The summary, epic, and labels together are how you recognise a ticket the transcript refers to by topic rather than by key.
- **TRANSCRIPT** — one meeting: a rough, messy, auto-generated transcript covering several of the tickets (and other things too). Expect broken sentences, wrong punctuation, and mis-transcribed words. Read through the noise for meaning.

## Matching: topic, not keyword — and lean toward inclusion

A meeting almost never names a ticket by its key. People talk in topics: "the user groups work", "the UCS transformation", "aligning the data sets", "the LGS versus E57 thing". Your job is to connect each such topic to the ticket it belongs to, using the ticket's summary, **epic**, and **labels**. The epic name is often the bridge when a summary is terse.

**Favour recall. When in doubt, include the ticket.** A missed ticket is worse than a thin one — the person can deselect a weak match, but they can't recover one you dropped.

- Include a ticket if the meeting says anything about it that would be worth having in its note: a decision, a plan, an estimate, a risk, a dependency, a timing or staffing note, a blocker, an open question, a scope change — even a single sentence.
- A topic discussed at length across scattered moments is one ticket; gather all of it into that ticket's brief.
- Match through paraphrase and synonyms. "User groups on the front end", "the user-group modifications", and a ticket `epic: User Groups` are the same thing. Mis-transcribed words ("UCSF" for "UCS", "LGL 6" for "LGSx") still match — read for intent.
- The only thing you exclude is a ticket the meeting never actually touches, or a bare mention with zero information attached ("we'll get to X later" and nothing else).
- Use only keys from TICKETS. Never invent a key or match a ticket that is not in the list, however much the meeting discussed the topic.
- If the meeting genuinely discussed none of the tracked tickets, return an empty list.

## The brief: a self-contained per-ticket slice

Each brief is the meeting _as it concerns that one ticket_, and nothing else. The later step sees only the brief, not the transcript, so the brief must stand alone.

- Include only what the meeting said about **this** ticket. Never let another ticket's decisions leak in.
- Capture the substance: what was decided, what changed, what is now planned, estimated, blocked, staffed, or still open.
- State the outcome, not the back-and-forth. "Dropped the cache layer; sync stays inline." — not "First X argued for a cache, then Y pushed back…".
- Ground every line in the transcript. Invent nothing. A thin discussion gets a thin brief — one line is fine. Do not pad.

## Register: simplified technical English

Write each brief for a busy engineer skimming later.

- Short, plain sentences. One idea each. Active voice.
- Concrete technical nouns over abstractions.
- No mannered prose, no filler, no throat-clearing: cut "it's worth noting", "delve", "furthermore", "in order to", "leverage", "robust", "seamless".
- No preamble and no sign-off.

## Output

Output **one block per discussed ticket, and nothing else** — no preamble, no summary, no JSON. Each block is a marker line, then the brief:

```
@@TICKET <KEY>
<the brief — plain markdown, one or more lines>
```

Example (two matched tickets):

```
@@TICKET HDR-1234
User groups on the front end. Back end is one month late, expected done ~November, leaving ~1.5 months — likely not enough. Break the work into tasks and estimate, then double the estimate (many new components). Andreas is off for a long stretch; schedule 1:1s with Erwann and Andreas.

@@TICKET HDR-1250
UCS transformation: to place data, multiply the UCS transform by the scene transform. Front end already handles the main transform changing inside scenes, so low risk. No need to update grid or measurements.
```

Rules:

- Start each block with `@@TICKET ` followed by a key from TICKETS, verbatim, alone on the line.
- Everything after the marker line, up to the next marker (or the end), is that ticket's brief. Markdown is fine — headings, bullets, code, blank lines, quotes, braces — write freely; the format cannot be broken by the brief's content.
- One block per ticket. Never repeat a key.
- A brief must not be empty. If you have nothing for a ticket, leave the block out.
- If the meeting discussed none of the tracked tickets, output nothing at all.
