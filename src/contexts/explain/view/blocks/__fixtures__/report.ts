import type { ExplainBlock, ExplainReport } from '~/kernel'

/**
 * One report containing every cell type, chaptered the way a real one is: an
 * overview plus two moves, one of them a mechanical follow-on (ADR-0010).
 *
 * It is a plausible review rather than lorem ipsum on purpose: a snapshot of
 * nonsense proves the markup renders, and a snapshot of a real review also shows
 * whether it reads well — which is the thing most likely to regress.
 */
export const EVERY_BLOCK_REPORT: ExplainReport = {
  version: 2,
  overview: [
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
  moves: [
    {
      id: 'rounding-leaves-pricing',
      title: 'Rounding leaves the pricing service',
      summary:
        'A rule the service owned becomes each caller’s responsibility, which is a contract change its callers are not all ready for.',
      systems: ['pricing', 'checkout'],
      paths: ['src/pricing/quote.ts', 'src/checkout/total.ts'],
      blocks: [
        {
          type: 'narrative',
          title: 'Where the rounding rule lives now',
          body: [
            '`quoteFor` used to round its result before returning it. It now returns raw cents, and',
            'each caller rounds for itself.',
            '',
            '- `checkout/total.ts` rounds half-up.',
            '- `billing/invoice.ts` truncates.',
          ].join('\n'),
        },
        {
          type: 'model',
          title: 'What pricing returns now',
          caption: '`Money` is the value object the rounding rule should have moved onto.',
          entities: [
            {
              name: 'Money',
              kind: 'added',
              note: 'the value object the rule lives on',
              fields: [
                { name: 'cents', type: 'number', note: 'unrounded' },
                { name: 'currency', type: 'Currency' },
              ],
            },
            {
              name: 'Quote',
              kind: 'changed',
              fields: [
                { name: 'id', type: 'QuoteId' },
                { name: 'total', type: 'Money' },
                { name: 'lines', type: 'readonly QuoteLine[]' },
              ],
            },
            {
              name: 'Account',
              kind: 'existing',
              note: 'owned by billing, unchanged',
              fields: [],
            },
          ],
          relations: [
            { from: 'Quote', to: 'Money', cardinality: 'one-to-one', label: 'totals to' },
            { from: 'Quote', to: 'Account', cardinality: 'one-to-optional', label: 'is billed to' },
          ],
        },
        {
          type: 'diff',
          path: 'src/pricing/quote.ts',
          language: 'typescript',
          caption:
            'The rounding call is simply gone, and the return type is unchanged — so no caller is forced to notice.',
          diff: '@@ -41,7 +41,7 @@ export function quoteFor(cart: Cart) {\n   const tax = taxFor(cart)\n-  return round(subtotal + tax)\n+  return subtotal + tax\n }',
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
            path: 'src/checkout/total.ts',
            language: 'typescript',
            diff: '@@ -18,6 +18,7 @@ export function totalFor(cart: Cart) {\n+  return Math.round(quoteFor(cart))',
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
      ],
    },
    {
      id: 'legacy-helper-deleted',
      title: 'The legacy rounding helper is deleted',
      summary:
        'Dead since the service stopped calling it, and removing it is what makes the move above irreversible.',
      systems: ['legacy-quotes'],
      paths: ['src/legacy-quotes/round.ts'],
      blocks: [
        {
          type: 'narrative',
          body: '`legacy-quotes/round.ts` had one caller, in `quoteFor`, and it goes with it. `git log` shows it was added for the 2019 invoicing migration and never used elsewhere.',
        },
      ],
    },
  ],
}

/** Every cell in the fixture, overview first then each move's, in reading order. */
export const EVERY_BLOCK: readonly ExplainBlock[] = [
  ...EVERY_BLOCK_REPORT.overview,
  ...EVERY_BLOCK_REPORT.moves.flatMap((move) => move.blocks),
]
