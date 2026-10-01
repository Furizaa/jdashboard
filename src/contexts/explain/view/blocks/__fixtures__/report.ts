import type { ExplainReport } from '~/kernel'

/**
 * One report containing every block type, used by the renderer snapshots.
 *
 * It is a plausible review rather than lorem ipsum on purpose: a snapshot of
 * nonsense proves the markup renders, and a snapshot of a real review also shows
 * whether it reads well — which is the thing most likely to regress.
 */
export const EVERY_BLOCK_REPORT: ExplainReport = {
  version: 1,
  blocks: [
    {
      type: 'verdict',
      verdict: 'discuss',
      headline: 'Rounding moved from the pricing service into its callers',
      detail:
        'The change is small and works, but it relocates a shared rule into two call sites. That is a decision, not an implementation detail.',
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
        { name: 'invoicing', role: 'rounds on its own, already', change: 'added' },
        { name: 'legacy-quotes', role: 'the old rounding helper is gone', change: 'removed' },
        { name: 'billing', role: 'consumes pricing output unchanged', change: 'read-only' },
      ],
    },
    {
      type: 'narrative',
      title: 'What changed',
      body: [
        '`quoteFor` used to round its result before returning it. It now returns raw cents, and',
        'each caller rounds for itself.',
        '',
        '- `checkout/total.ts` rounds half-up.',
        '- `billing/invoice.ts` truncates.',
      ].join('\n'),
    },
    {
      type: 'diagram',
      title: 'Where rounding happens now',
      caption: 'Two callers each own the rule the service used to own.',
      mermaid: 'flowchart LR\n  checkout --> quote\n  billing --> quote',
    },
    {
      type: 'finding',
      system: 'pricing',
      title: 'Two callers now own the same rounding rule',
      severity: 'high',
      whyItMatters:
        'Totals and line items can disagree by a cent once the two implementations drift, and the drift is invisible until a customer reports it.',
      detail: '`checkout/total.ts` rounds half-up; `billing/invoice.ts` truncates.',
      hunk: {
        path: 'src/pricing/quote.ts',
        language: 'typescript',
        diff: '@@ -41,7 +41,7 @@ export function quoteFor(cart: Cart) {\n   const tax = taxFor(cart)\n-  return round(subtotal + tax)\n+  return subtotal + tax\n }',
      },
    },
    {
      type: 'finding',
      system: 'checkout',
      title: 'The rounding helper is now imported across a layer boundary',
      severity: 'medium',
      whyItMatters:
        'Checkout reaching into the pricing module for a helper reverses the dependency direction the two had.',
    },
    {
      type: 'blast-radius',
      rows: [
        {
          surface: 'POST /quotes response',
          ifWrong: 'Quoted totals stop matching invoiced totals.',
          downstream: ['billing', 'reporting', 'the customer-facing quote PDF'],
          likelihood: 'medium',
        },
        {
          surface: 'quoteFor() return type',
          ifWrong: 'Any caller that assumed a rounded value is now off by cents.',
          downstream: [],
          likelihood: 'high',
        },
      ],
    },
    {
      type: 'questions',
      questions: [
        {
          question:
            "Is rounding meant to be the caller's responsibility from now on, or is this a step towards a money type?",
          why: 'The answer decides whether the duplication is temporary or the new design.',
        },
        { question: 'Was the legacy-quotes helper confirmed unused before it was removed?' },
      ],
    },
    {
      type: 'unverified',
      items: [
        {
          claim: 'The two rounding implementations actually differ.',
          why: 'Read both, but could not run them — no dependencies installed in this worktree.',
        },
        { claim: 'The test suite still passes.', why: 'Tests cannot be run here.' },
      ],
    },
  ],
}
