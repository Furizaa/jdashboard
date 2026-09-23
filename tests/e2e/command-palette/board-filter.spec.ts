import { test, expect } from '../fixtures/test'
import { makeIssue } from '../fixtures/factories'
import { testIds } from '~/lib/testids'
import { commandRows, openPalette } from './open-palette'

test('the palette applies and clears the board filter; the header chip tracks it', async ({
  page,
  world,
}) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-801', summary: 'HDR-801: Apple cobbler', statusName: 'Reviewed' }),
    makeIssue({
      key: 'HDR-802',
      summary: 'HDR-802: Banana split',
      statusName: 'In Implementation',
    }),
    makeIssue({ key: 'HDR-803', summary: 'HDR-803: Apple pie', statusName: 'In Code Review' }),
  ])

  await page.goto('/?e2e=1')
  const cards = page.getByTestId(testIds.ticketCard)
  const chip = page.getByTestId(testIds.boardFilterChip)
  await expect(cards).toHaveCount(3)
  await expect(chip).toHaveCount(0)

  // Whatever is typed into the palette *is* the filter text — no second input.
  await openPalette(page)
  await page.keyboard.type('apple')
  await commandRows(page).filter({ hasText: 'Filter board by' }).click()

  await expect(page.getByTestId(testIds.commandPalette)).toHaveCount(0)
  await expect(chip).toContainText('apple')
  await expect(page.locator('[data-issue-key="HDR-801"]')).toBeVisible()
  await expect(page.locator('[data-issue-key="HDR-803"]')).toBeVisible()
  await expect(page.locator('[data-issue-key="HDR-802"]')).toHaveCount(0)

  // "Clear board filter" becomes legal only once a filter is applied.
  await openPalette(page)
  await expect(commandRows(page).filter({ hasText: 'Clear board filter' })).toHaveCount(1)
  await page.keyboard.press('Escape')

  await page.getByTestId(testIds.boardFilterClear).click()
  await expect(chip).toHaveCount(0)
  await expect(cards).toHaveCount(3)
})

test('"Clear board filter" is absent while no filter is applied', async ({ page, world }) => {
  world.seedIssues([makeIssue({ key: 'HDR-804', summary: 'HDR-804: Nothing filtered' })])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await openPalette(page)
  await page.keyboard.type('clear')

  await expect(commandRows(page).filter({ hasText: 'Clear board filter' })).toHaveCount(0)
})

test('the filter chip clears on Escape while focused', async ({ page, world }) => {
  world.seedIssues([
    makeIssue({ key: 'HDR-805', summary: 'HDR-805: Cherry tart', statusName: 'Reviewed' }),
    makeIssue({ key: 'HDR-806', summary: 'HDR-806: Damson jam', statusName: 'Reviewed' }),
  ])
  await page.goto('/?e2e=1')
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(2)

  await openPalette(page)
  await page.keyboard.type('cherry')
  await commandRows(page).filter({ hasText: 'Filter board by' }).click()

  const chip = page.getByTestId(testIds.boardFilterChip)
  await expect(chip).toBeVisible()
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(1)

  await page.getByTestId(testIds.boardFilterClear).focus()
  await page.keyboard.press('Escape')

  await expect(chip).toHaveCount(0)
  await expect(page.getByTestId(testIds.ticketCard)).toHaveCount(2)
})
