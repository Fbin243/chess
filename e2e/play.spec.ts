import { expect, test } from '@playwright/test'

const ENGINE_TIMEOUT = 30_000

test('plays e2e4, gets a reply from the real engine, then undoes the turn', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toHaveText('Your move.')

  await page.locator('[data-square="e2"]').click()
  await page.locator('[data-square="e4"]').click()

  await expect(page.getByTestId('ply')).toHaveCount(2, { timeout: ENGINE_TIMEOUT })
  await expect(page.getByTestId('ply').first()).toHaveText('e4')
  await expect(page.getByTestId('status')).toHaveText('Your move.')

  await page.getByRole('button', { name: 'Undo' }).click()

  await expect(page.getByTestId('ply')).toHaveCount(0)
  await expect(page.locator('#board-piece-wP-e2')).toBeVisible()
  await expect(page.getByTestId('status')).toHaveText('Your move.')
})

test('the bot moves first when the player chooses Black', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Black').check()
  await page.getByRole('button', { name: 'New game', exact: true }).click()

  await expect(page.getByTestId('ply')).toHaveCount(1, { timeout: ENGINE_TIMEOUT })
  await expect(page.getByTestId('status')).toHaveText('Your move.')
  await expect(page.getByText('You play Black')).toBeVisible()
})
