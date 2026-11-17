import { expect, test, type Page } from '@playwright/test'

const ENGINE_TIMEOUT = 30_000
const REVIEW_TIMEOUT = 90_000

const ARROWS = 'svg[style*="pointer-events: none"] > path'

async function center(page: Page, square: string) {
  const box = await page.locator(`[data-square="${square}"]`).boundingBox()
  if (!box) throw new Error(`square ${square} is not visible`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function rightDrag(page: Page, from: string, to: string) {
  const a = await center(page, from)
  const b = await center(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.mouse.up({ button: 'right' })
}

async function playMove(page: Page, from: string, to: string, expectedPlies: number) {
  await page.locator(`[data-square="${from}"]`).click()
  await page.locator(`[data-square="${to}"]`).click()
  await expect(page.getByTestId('ply')).toHaveCount(expectedPlies, { timeout: ENGINE_TIMEOUT })
  await expect(page.getByTestId('status')).toHaveText('Your move.', { timeout: ENGINE_TIMEOUT })
}

test('the eval bar appears and gets a value after a move', async ({ page }) => {
  await page.goto('/')
  const bar = page.getByTestId('eval-bar')
  await expect(bar).toBeVisible()

  await playMove(page, 'e2', 'e4', 2)
  await expect(bar).toHaveAttribute('data-eval', /^([+−]\d+\.\d|−?M\d+)$/, { timeout: ENGINE_TIMEOUT })

  await page.getByLabel('Show eval bar').uncheck()
  await expect(bar).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Show eval bar')).not.toBeChecked()
  await expect(page.getByTestId('eval-bar')).toHaveCount(0)
})

test('right-click draws arrows and highlights, and a left-click move clears them', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toHaveText('Your move.')
  const clear = page.getByRole('button', { name: 'Clear marks' })
  await expect(clear).toBeDisabled()

  await rightDrag(page, 'g1', 'f3')
  await expect(page.locator(ARROWS)).toHaveCount(1)
  await expect(clear).toBeEnabled()

  const square = page.locator('[data-square="d4"]')
  const overlay = square.locator('> div')
  await square.click({ button: 'right' })
  await expect(overlay).toHaveCSS('background-color', 'rgba(46, 157, 56, 0.6)')
  await square.click({ button: 'right' })
  await expect(overlay).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await square.click({ button: 'right', modifiers: ['Alt'] })
  await expect(overlay).toHaveCSS('background-color', 'rgba(211, 59, 59, 0.6)')
  await square.click({ button: 'right', modifiers: ['Shift'] })
  await expect(overlay).toHaveCSS('background-color', 'rgba(47, 127, 216, 0.6)')
  await square.click({ button: 'right', modifiers: ['Shift'] })
  await expect(overlay).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await square.click({ button: 'right', modifiers: ['Alt'] })
  await expect(overlay).toHaveCSS('background-color', 'rgba(211, 59, 59, 0.6)')

  await page.keyboard.press('Escape')
  await expect(page.locator(ARROWS)).toHaveCount(0)
  await expect(overlay).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(clear).toBeDisabled()

  await rightDrag(page, 'b1', 'c3')
  await square.click({ button: 'right', modifiers: ['Shift'] })
  await expect(page.locator(ARROWS)).toHaveCount(1)
  await expect(overlay).toHaveCSS('background-color', 'rgba(47, 127, 216, 0.6)')

  await page.locator('[data-square="e2"]').click()
  await page.locator('[data-square="e4"]').click()
  await expect(page.locator(ARROWS)).toHaveCount(0)
  await expect(overlay).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

test('Review game classifies every move and shows the summary', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(page.getByTestId('status')).toHaveText('Your move.')
  await page.getByLabel('Show eval bar').uncheck()

  await playMove(page, 'e2', 'e4', 2)
  await playMove(page, 'g1', 'f3', 4)

  await page.getByRole('button', { name: 'Review game' }).click()
  await expect(page.getByTestId('review-progress')).toBeVisible()
  await expect(page.getByTestId('review-table')).toBeVisible({ timeout: REVIEW_TIMEOUT })
  await expect(page.getByRole('button', { name: 'Review game' })).toBeEnabled({ timeout: REVIEW_TIMEOUT })

  await expect(page.getByTestId('ply-icon')).toHaveCount(4)
  await expect(page.getByTestId('accuracy-w')).toContainText('%')
  await expect(page.getByTestId('accuracy-b')).toContainText('%')
  for (const icon of await page.getByTestId('ply-icon').all()) {
    await expect(icon).toHaveAttribute('aria-label', /\S/)
  }
})

test('the layout is centered and the board is large on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const frame = page.getByTestId('board-frame')
  const panel = page.locator('.side-panel')
  await expect(frame).toBeVisible()

  const board = await frame.boundingBox()
  const side = await panel.boundingBox()
  if (!board || !side) throw new Error('layout is not rendered')
  expect(board.width).toBeGreaterThan(640)
  expect(Math.abs(board.width - board.height)).toBeLessThan(2)
  expect(side.width).toBeCloseTo(340, 0)

  const barBox = await page.getByTestId('eval-bar').boundingBox()
  if (!barBox) throw new Error('eval bar is not rendered')
  expect(barBox.width).toBeCloseTo(24, 0)
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(board.x)

  const leftGap = barBox.x
  const rightGap = 1440 - (side.x + side.width)
  expect(Math.abs(leftGap - rightGap)).toBeLessThan(24)
})

test('the layout stacks on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const frame = page.getByTestId('board-frame')
  await expect(frame).toBeVisible()

  const board = await frame.boundingBox()
  const side = await page.locator('.side-panel').boundingBox()
  const bar = await page.getByTestId('eval-bar').boundingBox()
  if (!board || !side || !bar) throw new Error('layout is not rendered')
  expect(side.y).toBeGreaterThanOrEqual(board.y + board.height)
  expect(board.width).toBeGreaterThan(340)
  expect(board.width).toBeLessThanOrEqual(390)
  expect(bar.height).toBeCloseTo(14, 0)
  expect(side.width).toBeGreaterThan(340)
})
