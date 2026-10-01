#!/usr/bin/env node
// A stand-in for the local `claude` CLI, pointed at by `CLASHBOARD_CLAUDE_BIN`
// in `playwright.config.ts`.
//
// ADR-0001 says mock at the network boundary. The agent is not a network call —
// it is a subprocess — so the boundary here is the process, and this is the
// stub that stands at it. It emits canned `--output-format stream-json` lines:
// a couple of activity events the tab should render live, then a terminal
// `result` carrying a report that satisfies `explainReportSchema`.
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
  version: 1,
  blocks: [
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
      type: 'narrative',
      title: 'What changed',
      body: '`quoteFor` returns raw cents now, and each caller rounds for itself.',
    },
    {
      type: 'diagram',
      title: 'Where rounding lives now',
      mermaid: 'flowchart LR\n  checkout[checkout] --> pricing[pricing]\n  checkout --> round[round]',
      caption: 'Rounding sits beside the caller, not inside the quote.',
    },
    {
      type: 'finding',
      system: 'pricing',
      title: 'Two callers now own the same rounding rule',
      severity: 'high',
      whyItMatters: 'Totals and line items can disagree by a cent once they drift.',
      hunk: {
        path: 'src/pricing/quote.ts',
        language: 'typescript',
        diff: '@@ -41,7 +41,7 @@\n-  return round(subtotal + tax)\n+  return subtotal + tax',
      },
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
}

const ACTIVITY = [
  { type: 'system', subtype: 'init', tools: ['Read', 'Grep'] },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'Read', input: { file_path: 'src/pricing/quote.ts' } }],
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
