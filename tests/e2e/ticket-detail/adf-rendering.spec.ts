import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import type { AdfNode } from '~/server/gateways/jira'

const KEY = 'HDR-450'

const description: AdfNode = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Heading two' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'before-break' },
        { type: 'hardBreak' },
        { type: 'text', text: 'after-break' },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'bold-text', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'italic-text', marks: [{ type: 'em' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'inline-code', marks: [{ type: 'code' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'struck-text', marks: [{ type: 'strike' }] },
        { type: 'text', text: ' ' },
        {
          type: 'text',
          text: 'link-text',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/foo' } }],
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bullet-item' }] }],
        },
      ],
    },
    {
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ordered-item' }] }],
        },
      ],
    },
    {
      type: 'codeBlock',
      content: [{ type: 'text', text: 'code-block-content' }],
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted-text' }] }],
    },
    { type: 'rule' },
    { type: 'mention', attrs: { id: 'acct-1', text: '@Mentioned User' } },
    { type: 'emoji', attrs: { shortName: ':smile:', text: 'EMO-😀' } },
    { type: 'status', attrs: { text: 'STATUS-LABEL', color: 'green' } },
    {
      type: 'panel',
      attrs: { panelType: 'info' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'panel-content' }] }],
    },
    {
      type: 'mediaSingle',
      content: [
        {
          type: 'media',
          attrs: { url: 'https://example.com/img.png', alt: 'media-alt' },
        },
      ],
    },
    // Unsupported fallback — surfaces as `[unsupported: <type>]`.
    { type: 'mysteryNode' },
  ],
}

test('description renders every supported ADF node and an unsupported placeholder', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: KEY, statusName: 'In Implementation' })])
  world.seedIssueDetail(KEY, { description })

  await page.goto(`/?e2e=1&issue=${KEY}`)

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Block nodes
  await expect(dialog.getByRole('heading', { name: 'Heading two', level: 2 })).toBeVisible()
  await expect(dialog.getByText('before-break')).toBeVisible()
  await expect(dialog.getByText('after-break')).toBeVisible()
  await expect(dialog.locator('br')).toHaveCount(1)
  await expect(dialog.locator('hr')).toHaveCount(1)
  await expect(dialog.locator('ul li').filter({ hasText: 'bullet-item' })).toBeVisible()
  await expect(dialog.locator('ol li').filter({ hasText: 'ordered-item' })).toBeVisible()
  await expect(dialog.locator('pre code')).toContainText('code-block-content')
  await expect(dialog.locator('blockquote')).toContainText('quoted-text')

  // Text marks
  await expect(dialog.locator('strong', { hasText: 'bold-text' })).toBeVisible()
  await expect(dialog.locator('em', { hasText: 'italic-text' })).toBeVisible()
  await expect(dialog.locator('code', { hasText: 'inline-code' })).toBeVisible()
  await expect(dialog.locator('s', { hasText: 'struck-text' })).toBeVisible()
  const link = dialog.getByRole('link', { name: 'link-text' })
  await expect(link).toHaveAttribute('href', 'https://example.com/foo')

  // Inline / atomic nodes
  await expect(dialog.getByText('@Mentioned User')).toBeVisible()
  await expect(dialog.getByText('EMO-😀')).toBeVisible()
  await expect(dialog.getByText('STATUS-LABEL')).toBeVisible()
  await expect(dialog.getByText('panel-content')).toBeVisible()

  // mediaSingle → <img> with the supplied URL/alt
  const img = dialog.getByRole('img', { name: 'media-alt' })
  await expect(img).toHaveAttribute('src', 'https://example.com/img.png')

  // Unsupported fallback
  await expect(dialog.getByText('[unsupported: mysteryNode]')).toBeVisible()
})
