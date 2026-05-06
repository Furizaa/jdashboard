import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { AdfNode } from '~/server/jira'
import { RenderAdf } from './RenderAdf'

function html(doc: AdfNode | null): string {
  return render(<RenderAdf doc={doc} />).container.innerHTML
}

function wrap(node: AdfNode): AdfNode {
  return { type: 'doc', content: [node] }
}

describe('RenderAdf', () => {
  it('renders null doc as nothing', () => {
    expect(html(null)).toBe('')
  })

  it('renders an empty doc as an empty wrapper', () => {
    expect(html({ type: 'doc', content: [] })).toMatchInlineSnapshot(
      `"<div class="space-y-3"></div>"`,
    )
  })

  it('renders a paragraph', () => {
    expect(
      html(wrap({ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] })),
    ).toMatchInlineSnapshot(
      `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed">Hello world</p></div>"`,
    )
  })

  it.each([1, 2, 3, 4, 5, 6])('renders heading level %i', (level) => {
    expect(
      html(
        wrap({
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: `H${level}` }],
        }),
      ),
    ).toMatchSnapshot()
  })

  describe('text marks', () => {
    it('renders strong', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [{ type: 'text', text: 'bold', marks: [{ type: 'strong' }] }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><strong class="text-foreground font-semibold">bold</strong></p></div>"`,
      )
    })

    it('renders em', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [{ type: 'text', text: 'italic', marks: [{ type: 'em' }] }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><em>italic</em></p></div>"`,
      )
    })

    it('renders strike', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [{ type: 'text', text: 'gone', marks: [{ type: 'strike' }] }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><s>gone</s></p></div>"`,
      )
    })

    it('renders inline code', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [{ type: 'text', text: 'foo()', marks: [{ type: 'code' }] }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><code class="bg-muted/60 text-foreground rounded px-1 py-0.5 font-mono text-[0.85em]">foo()</code></p></div>"`,
      )
    })

    it('renders link with target=_blank and rel=noopener noreferrer', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'docs',
                marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
              },
            ],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-sky-400 underline-offset-2 hover:underline">docs</a></p></div>"`,
      )
    })

    it('composes multiple marks (strong + em + code)', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'all',
                marks: [{ type: 'strong' }, { type: 'em' }, { type: 'code' }],
              },
            ],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><code class="bg-muted/60 text-foreground rounded px-1 py-0.5 font-mono text-[0.85em]"><em><strong class="text-foreground font-semibold">all</strong></em></code></p></div>"`,
      )
    })

    it('composes link + strong (link wraps bolded text)', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'click',
                marks: [
                  { type: 'strong' },
                  { type: 'link', attrs: { href: 'https://example.com' } },
                ],
              },
            ],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-sky-400 underline-offset-2 hover:underline"><strong class="text-foreground font-semibold">click</strong></a></p></div>"`,
      )
    })
  })

  it('renders bulletList with listItems', () => {
    expect(
      html(
        wrap({
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
            },
          ],
        }),
      ),
    ).toMatchSnapshot()
  })

  it('renders orderedList with listItems', () => {
    expect(
      html(
        wrap({
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }],
            },
          ],
        }),
      ),
    ).toMatchSnapshot()
  })

  it('renders codeBlock', () => {
    expect(
      html(
        wrap({
          type: 'codeBlock',
          content: [{ type: 'text', text: 'const x = 1' }],
        }),
      ),
    ).toMatchInlineSnapshot(
      `"<div class="space-y-3"><pre class="bg-muted/50 border-border text-foreground/90 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed"><code>const x = 1</code></pre></div>"`,
    )
  })

  it('renders blockquote', () => {
    expect(
      html(
        wrap({
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }],
        }),
      ),
    ).toMatchInlineSnapshot(
      `"<div class="space-y-3"><blockquote class="border-border text-foreground/75 space-y-2 border-l-2 pl-3 italic"><p class="text-foreground/85 text-sm leading-relaxed">quoted</p></blockquote></div>"`,
    )
  })

  it('renders hardBreak inside a paragraph', () => {
    expect(
      html(
        wrap({
          type: 'paragraph',
          content: [
            { type: 'text', text: 'line 1' },
            { type: 'hardBreak' },
            { type: 'text', text: 'line 2' },
          ],
        }),
      ),
    ).toMatchInlineSnapshot(
      `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed">line 1<br>line 2</p></div>"`,
    )
  })

  it('renders rule', () => {
    expect(html(wrap({ type: 'rule' }))).toMatchInlineSnapshot(
      `"<div class="space-y-3"><hr class="border-border my-1"></div>"`,
    )
  })

  it('renders an unknown node type by descending into its children', () => {
    expect(
      html(
        wrap({
          type: 'mediaSingle',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inner' }] }],
        }),
      ),
    ).toMatchInlineSnapshot(
      `"<div class="space-y-3"><span><p class="text-foreground/85 text-sm leading-relaxed">inner</p></span></div>"`,
    )
  })

  describe('combined fixtures', () => {
    it('renders a typical bug-report description (heading + paragraph + bullet list + code block)', () => {
      const doc: AdfNode = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Steps to reproduce' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Open the ' },
              { type: 'text', text: 'admin panel', marks: [{ type: 'strong' }] },
              { type: 'text', text: ' and:' },
            ],
          },
          {
            type: 'orderedList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Click Settings' }] },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'Run ' },
                      { type: 'text', text: 'npm run build', marks: [{ type: 'code' }] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'codeBlock',
            content: [{ type: 'text', text: 'Error: ENOENT' }],
          },
        ],
      }
      expect(html(doc)).toMatchSnapshot()
    })

    it('renders prose with a link, italic, and a horizontal rule', () => {
      const doc: AdfNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'See the ' },
              {
                type: 'text',
                text: 'spec',
                marks: [{ type: 'link', attrs: { href: 'https://example.com/spec' } }],
              },
              { type: 'text', text: ' for ' },
              { type: 'text', text: 'context', marks: [{ type: 'em' }] },
              { type: 'text', text: '.' },
            ],
          },
          { type: 'rule' },
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Reviewer note: looks good.' }],
              },
            ],
          },
        ],
      }
      expect(html(doc)).toMatchSnapshot()
    })
  })
})
