import { type Locator, type Page } from '@playwright/test'
import { testIds } from '~/lib/testids'

/**
 * Click a ticket card's body.
 *
 * Playwright clicks an element's centre, and on a short card — In Implementation
 * with no labels or MR row — the centre lands on the status pill, whose wrapper
 * stops propagation. The card's summary is the one region guaranteed to carry no
 * interactive child, so that is what "click the card" means here.
 */
export async function clickCardBody(page: Page, issueKey: string): Promise<void> {
  await cardFor(page, issueKey).getByTestId(testIds.cardSummary).click()
}

export function cardFor(page: Page, issueKey: string): Locator {
  return page.locator(`[data-issue-key="${issueKey}"]`)
}
