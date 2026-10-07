#!/usr/bin/env node
// A stand-in for the local `claude` CLI, pointed at by `CLASHBOARD_CLAUDE_BIN`
// in `playwright.config.ts`.
//
// ADR-0001 says mock at the network boundary. The agent is not a network call —
// it is a subprocess — so the boundary here is the process, and this is the
// stub that stands at it. It emits canned `--output-format stream-json` lines:
// a couple of activity events the tab should render live, then a terminal
// `result` carrying a report that satisfies `explainReportSchema` — chaptered
// into an overview and two moves, like a real one (ADR-0010).
//
// It deliberately does *not* read stdin or inspect its argv. What the real
// agent is asked and what it is allowed to do are covered by unit tests over
// `explain-agent.ts`; what this stub exists to exercise is the surface — the
// tab, the stream, the report, and the close.

import { stdin, stdout } from 'node:process'

// The prompt arrives on stdin; drain it so the parent's write never hits EPIPE.
stdin.resume()
stdin.on('data', () => {})

// A reader that goes away mid-stream (an aborted run) should not look like a
// crash, which is how the real CLI behaves too.
stdout.on('error', () => process.exit(0))

const emit = (event) => stdout.write(`${JSON.stringify(event)}\n`)

const REPORT = {
  version: 2,
  overview: [
    {
      type: 'verdict',
      verdict: 'discuss',
      headline: 'Rounding moved out of the pricing service',
      detail: 'It works, but it relocates a shared rule into two call sites.',
    },
    {
      type: 'systems',
      systems: [
        {
          name: 'pricing',
          role: 'no longer rounds; returns raw cents',
          change: 'contract-changed',
        },
        { name: 'checkout', role: 'now rounds before display', change: 'changed' },
      ],
    },
    {
      type: 'blast-radius',
      rows: [
        {
          surface: 'POST /quotes response',
          ifWrong: 'Quoted totals stop matching invoiced totals.',
          downstream: ['billing'],
          likelihood: 'medium',
        },
      ],
    },
    {
      type: 'questions',
      questions: [{ question: 'Is rounding the caller’s job from now on?' }],
    },
    {
      type: 'unverified',
      items: [{ claim: 'The suite still passes.', why: 'Tests cannot be run in the worktree.' }],
    },
  ],
  moves: [
    {
      id: 'rounding-leaves-pricing',
      title: 'Rounding leaves the pricing service',
      summary: 'A rule the service owned becomes each caller’s responsibility.',
      systems: ['pricing', 'checkout'],
      paths: ['src/pricing/quote.ts', 'src/checkout/total.ts'],
      blocks: [
        {
          type: 'narrative',
          title: 'Where the rounding rule lives now',
          body: '`quoteFor` returns raw cents now, and each caller rounds for itself.',
        },
        {
          // Deliberately full of the things mermaid's ER grammar rejects — an
          // angle-bracket generic, a pipe union, a space in a type, a `%` in a
          // name, and a relation labelled `one`, which is a cardinality keyword.
          // The report keeps them as the source spells them; `mermaidForModel`
          // is what has to make them drawable, and this is the only place a real
          // browser proves it did (ADR-0011 §2).
          type: 'model',
          title: 'What pricing returns now',
          caption: '`Money` is the value object the rule should have moved onto.',
          entities: [
            {
              name: 'Money',
              kind: 'added',
              note: 'the value object the rule lives on',
              fields: [
                { name: 'cents', type: 'number', note: 'unrounded' },
                { name: 'byCurrency', type: 'Record<string, Money>' },
                { name: 'label', type: 'string | null' },
                { name: 'lines', type: 'readonly QuoteLine[]' },
              ],
            },
            { name: 'Quote', kind: 'changed', fields: [{ name: 'total', type: 'Money' }] },
            { name: '100% owned Account', kind: 'existing', note: 'owned by billing' },
          ],
          relations: [
            { from: 'Quote', to: 'Money', cardinality: 'one-to-one', label: 'one' },
            {
              from: 'Quote',
              to: '100% owned Account',
              cardinality: 'one-to-optional',
              label: 'is billed to',
            },
          ],
        },
        {
          type: 'diff',
          path: 'src/pricing/quote.ts',
          language: 'typescript',
          caption: 'The rounding call is simply gone.',
          diff: '@@ -41,7 +41,7 @@\n-  return round(subtotal + tax)\n+  return subtotal + tax',
        },
        {
          type: 'diagram',
          title: 'Where rounding lives now',
          mermaid:
            'flowchart LR\n  checkout[checkout] --> pricing[pricing]\n  checkout --> round[round]',
          caption: 'Rounding sits beside the caller, not inside the quote.',
        },
        {
          type: 'finding',
          system: 'pricing',
          title: 'Two callers now own the same rounding rule',
          severity: 'high',
          whyItMatters: 'Totals and line items can disagree by a cent once they drift.',
          hunk: {
            path: 'src/checkout/total.ts',
            language: 'typescript',
            diff: '@@ -18,6 +18,7 @@\n+  return Math.round(quoteFor(cart))',
          },
        },
      ],
    },
    {
      id: 'legacy-helper-deleted',
      title: 'The legacy rounding helper is deleted',
      summary: 'Dead once the service stopped calling it.',
      systems: ['legacy-quotes'],
      paths: ['src/legacy-quotes/round.ts'],
      blocks: [{ type: 'narrative', body: 'One caller, in `quoteFor`, and it goes with it.' }],
    },
  ],
}

const ACTIVITY = [
  { type: 'system', subtype: 'init', tools: ['Read', 'Grep'] },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'Read',
          input: { file_path: 'src/pricing/quote.ts' },
        },
      ],
    },
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tu_2',
          name: 'Bash',
          input: { command: 'git log --oneline -- src/pricing' },
        },
      ],
    },
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Rounding moved to the callers.' }],
    },
  },
]

// Spread over a few ticks so the test can see the log grow rather than arrive
// as one burst — which is the behaviour the SSE channel exists for.
const STEP_MS = 120
// And a pause before the verdict, because the activity log is *replaced* by the
// report: a stub that answered in 200ms would make the log unobservable, which
// is the one thing a real multi-minute run never is.
const VERDICT_DELAY_MS = 1_500

let index = 0
const next = () => {
  if (index < ACTIVITY.length) {
    emit(ACTIVITY[index])
    index += 1
    setTimeout(next, STEP_MS)
    return
  }
  setTimeout(() => {
    emit({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: JSON.stringify(REPORT),
    })
    stdout.end()
  }, VERDICT_DELAY_MS)
}

setTimeout(next, STEP_MS)
