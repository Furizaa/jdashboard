import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { AdfNode } from '~/kernel'
import { RenderAdf } from './RenderAdf'

afterEach(() => {
  cleanup()
})

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

  describe('codeBlock', () => {
    it('renders without language attribute as a plain block (no Shiki dependency loaded)', () => {
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

    it('renders the Suspense fallback (plain block) when a recognised language requires the lazy highlighter', () => {
      // The lazy import does not resolve in jsdom without extra setup; the contract under
      // test here is that the synchronous render is still the plain markup, so a code
      // block never blanks the panel while Shiki is loading.
      expect(
        html(
          wrap({
            type: 'codeBlock',
            attrs: { language: 'typescript' },
            content: [{ type: 'text', text: 'const x: number = 1' }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><pre class="bg-muted/50 border-border text-foreground/90 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed"><code>const x: number = 1</code></pre></div>"`,
      )
    })

    it('renders an unrecognised language as a plain block (no Shiki dependency loaded)', () => {
      expect(
        html(
          wrap({
            type: 'codeBlock',
            attrs: { language: 'gobbledygook' },
            content: [{ type: 'text', text: 'unknown content' }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><pre class="bg-muted/50 border-border text-foreground/90 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed"><code>unknown content</code></pre></div>"`,
      )
    })
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

  describe('mention', () => {
    it('renders mention text inline', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [
              { type: 'text', text: 'cc ' },
              { type: 'mention', attrs: { id: 'abc', text: '@Jane Doe' } },
            ],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed">cc <span class="inline-flex items-center rounded-sm bg-sky-500/15 px-1 font-medium text-sky-300">@Jane Doe</span></p></div>"`,
      )
    })
  })

  describe('emoji', () => {
    it('renders unicode glyph from attrs.text', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [{ type: 'emoji', attrs: { shortName: ':smile:', text: '😄' } }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><span>😄</span></p></div>"`,
      )
    })

    it('falls back to shortName when text is missing', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [{ type: 'emoji', attrs: { shortName: ':smile:' } }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><span>:smile:</span></p></div>"`,
      )
    })
  })

  describe('status', () => {
    it('renders status pill with the configured color and label', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [
              { type: 'status', attrs: { text: 'In Review', color: 'yellow', localId: 'x' } },
            ],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium tracking-wide uppercase bg-yellow-500/20 text-yellow-200">In Review</span></p></div>"`,
      )
    })

    it('falls back to neutral styling for an unknown color', () => {
      expect(
        html(
          wrap({
            type: 'paragraph',
            content: [{ type: 'status', attrs: { text: 'Pending', color: 'magenta' } }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><p class="text-foreground/85 text-sm leading-relaxed"><span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium tracking-wide uppercase bg-slate-500/20 text-slate-200">Pending</span></p></div>"`,
      )
    })
  })

  describe('media', () => {
    it('renders mediaSingle as an inline image when url is present', () => {
      expect(
        html(
          wrap({
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  type: 'file',
                  id: 'abc',
                  url: 'https://example.com/img.png',
                  alt: 'screenshot',
                  width: 320,
                  height: 200,
                },
              },
            ],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><div class="my-2"><img alt="screenshot" width="320" height="200" class="border-border max-w-full rounded-md border" src="https://example.com/img.png"></div></div>"`,
      )
    })

    it('renders a placeholder with Open in Jira link when only id is present', () => {
      const doc: AdfNode = wrap({
        type: 'mediaSingle',
        content: [{ type: 'media', attrs: { type: 'file', id: 'abc' } }],
      })
      expect(
        render(<RenderAdf doc={doc} jiraBaseUrl="https://j.example.com" />).container.innerHTML,
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><div class="my-2"><span class="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"><span>Media hosted in Jira</span><a href="https://j.example.com" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:underline">Open in Jira</a></span></div></div>"`,
      )
    })

    it('renders a placeholder without a link when no jiraBaseUrl is supplied', () => {
      expect(
        html(
          wrap({
            type: 'mediaSingle',
            content: [{ type: 'media', attrs: { type: 'file', id: 'abc' } }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><div class="my-2"><span class="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"><span>Media hosted in Jira</span></span></div></div>"`,
      )
    })

    it('renders mediaGroup with multiple media children', () => {
      expect(
        html(
          wrap({
            type: 'mediaGroup',
            content: [
              {
                type: 'media',
                attrs: { type: 'file', id: 'a', url: 'https://example.com/a.png' },
              },
              {
                type: 'media',
                attrs: { type: 'file', id: 'b', url: 'https://example.com/b.png' },
              },
            ],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><div class="my-2 flex flex-wrap gap-2"><img alt="" class="border-border max-w-full rounded-md border" src="https://example.com/a.png"><img alt="" class="border-border max-w-full rounded-md border" src="https://example.com/b.png"></div></div>"`,
      )
    })
  })

  describe('inlineCard', () => {
    const BASE = 'https://hexagon.atlassian.net'

    it('renders a Jira-issue chip when the URL matches <jiraBaseUrl>/browse/<KEY>', () => {
      const doc: AdfNode = wrap({
        type: 'paragraph',
        content: [{ type: 'inlineCard', attrs: { url: `${BASE}/browse/HDR-123` } }],
      })
      const { container, getByRole } = render(<RenderAdf doc={doc} jiraBaseUrl={BASE} />)
      const link = getByRole('link', { name: 'HDR-123' })
      expect(link).toHaveAttribute('href', `${BASE}/browse/HDR-123`)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(container.innerHTML).toContain('HDR-123')
    })

    it('renders a plain-URL chip with truncated host+path for non-Jira URLs', () => {
      const doc: AdfNode = wrap({
        type: 'paragraph',
        content: [{ type: 'inlineCard', attrs: { url: 'https://github.com/foo/bar/issues/1' } }],
      })
      const { getByRole } = render(<RenderAdf doc={doc} jiraBaseUrl={BASE} />)
      const link = getByRole('link', { name: /github\.com\/foo\/bar\/issues\/1/ })
      expect(link).toHaveAttribute('href', 'https://github.com/foo/bar/issues/1')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('falls through to PlainUrl when no jiraBaseUrl is supplied', () => {
      const doc: AdfNode = wrap({
        type: 'paragraph',
        content: [{ type: 'inlineCard', attrs: { url: `${BASE}/browse/HDR-123` } }],
      })
      const { getByRole, queryByRole } = render(<RenderAdf doc={doc} />)
      // Without a base URL, the chip is the plain-URL chip showing host+path,
      // not the Jira issue chip showing 'HDR-123'.
      expect(queryByRole('link', { name: 'HDR-123' })).toBeNull()
      const link = getByRole('link', { name: /hexagon\.atlassian\.net\/browse\/HDR-123/ })
      expect(link).toHaveAttribute('href', `${BASE}/browse/HDR-123`)
    })
  })

  describe('panel', () => {
    it.each(['info', 'note', 'warning', 'error', 'success'])(
      'renders panel of type %s with distinct styling',
      (panelType) => {
        expect(
          html(
            wrap({
              type: 'panel',
              attrs: { panelType },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: panelType }] }],
            }),
          ),
        ).toMatchSnapshot()
      },
    )

    it('falls back to info styling for an unknown panelType', () => {
      expect(
        html(
          wrap({
            type: 'panel',
            attrs: { panelType: 'mystery' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'fallback' }] }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><div class="space-y-2 rounded-md border px-3 py-2 border-sky-500/40 bg-sky-500/10"><p class="text-foreground/85 text-sm leading-relaxed">fallback</p></div></div>"`,
      )
    })
  })

  describe('fallback', () => {
    it('renders unsupported node types as a faint placeholder', () => {
      expect(
        html(
          wrap({
            type: 'extensionFrame',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inner' }] }],
          }),
        ),
      ).toMatchInlineSnapshot(
        `"<div class="space-y-3"><span class="text-muted-foreground/50 italic">[unsupported: extensionFrame]</span></div>"`,
      )
    })

    it('does not throw when the renderer encounters an unknown node type', () => {
      expect(() => html(wrap({ type: 'someBrandNewNodeType' as string }))).not.toThrow()
    })
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
