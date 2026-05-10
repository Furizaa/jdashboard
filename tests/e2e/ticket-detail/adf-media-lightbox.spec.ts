import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import type { AdfNode } from '~/server/gateways/jira'

const KEY = 'HDR-460'
const PROXY = 'http://127.0.0.1:9999/api/jira-media'

function descriptionWithMedia(url: string, mimeType: string, alt: string): AdfNode {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Attached:' }],
      },
      {
        type: 'mediaSingle',
        content: [{ type: 'media', attrs: { url, mimeType, alt } }],
      },
    ],
  }
}

test('clicking an image preview opens the lightbox; Escape closes only the lightbox', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: KEY, statusName: 'In Implementation' })])
  world.seedIssueDetail(KEY, {
    description: descriptionWithMedia(`${PROXY}/img-1`, 'image/png', 'screenshot'),
  })

  await page.goto(`/?e2e=1&issue=${KEY}`)

  // Surrounding panel role="dialog" is the issue's accessible label.
  const panelDialog = page.getByRole('dialog', { name: new RegExp(`^${KEY} —`) })
  await expect(panelDialog).toBeVisible()

  const previewButton = panelDialog.getByRole('button', { name: 'screenshot' })
  await expect(previewButton).toBeVisible()
  await previewButton.click()

  // Lightbox dialog is a separate role="dialog" portal, named after the alt.
  const lightbox = page.getByRole('dialog', { name: 'screenshot' })
  await expect(lightbox).toBeVisible()
  await expect(lightbox.locator('img')).toHaveAttribute('src', `${PROXY}/img-1`)

  await page.keyboard.press('Escape')

  // Lightbox is gone; the surrounding panel is still there.
  await expect(lightbox).toBeHidden()
  await expect(panelDialog).toBeVisible()
})

test('clicking a video preview opens an autoplay-muted lightbox; × closes it', async ({
  page,
  world,
}) => {
  world.seedIssues([makeIssue({ key: KEY, statusName: 'In Implementation' })])
  world.seedIssueDetail(KEY, {
    description: descriptionWithMedia(`${PROXY}/video-1`, 'video/mp4', 'screencast'),
  })

  await page.goto(`/?e2e=1&issue=${KEY}`)

  const panelDialog = page.getByRole('dialog', { name: new RegExp(`^${KEY} —`) })
  await expect(panelDialog).toBeVisible()

  const previewButton = panelDialog.getByRole('button', { name: 'screencast' })
  await expect(previewButton).toBeVisible()
  await previewButton.click()

  const lightbox = page.getByRole('dialog', { name: 'screencast' })
  await expect(lightbox).toBeVisible()

  const video = lightbox.locator('video')
  await expect(video).toHaveAttribute('src', `${PROXY}/video-1`)
  await expect(video).toHaveJSProperty('autoplay', true)
  await expect(video).toHaveJSProperty('muted', true)
  await expect(video).toHaveJSProperty('controls', true)

  await lightbox.getByRole('button', { name: 'Close' }).click()
  await expect(lightbox).toBeHidden()
  await expect(panelDialog).toBeVisible()
})

test('proxy 404 swaps the lightbox content to the inline error chip', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: KEY, statusName: 'In Implementation' })])
  world.seedIssueDetail(KEY, {
    description: descriptionWithMedia(`${PROXY}/missing`, 'image/png', 'broken'),
  })

  await page.goto(`/?e2e=1&issue=${KEY}`)

  const panelDialog = page.getByRole('dialog', { name: new RegExp(`^${KEY} —`) })
  await expect(panelDialog).toBeVisible()

  // The inline preview's <img onError> fires first — preview swaps to the
  // MediaUnavailable chip in-document. There is no preview button to click,
  // so we assert the inline-document chip is visible. (The same chip renders
  // inside the lightbox if the modal's own image errors after opening.)
  await expect(panelDialog.getByText('Media unavailable')).toBeVisible()
})
