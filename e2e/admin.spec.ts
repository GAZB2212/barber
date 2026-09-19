import { expect, test } from '@playwright/test'

/**
 * Dashboard cover, run against the keyless demo where the app signs you in as
 * an owner. Exercises the things a barber does every day.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

test('the diary shows today and can be walked day by day', async ({ page }) => {
  await page.goto(`${BASE}/admin`)

  await expect(page.getByText('Demo mode', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const heading = await page.getByRole('heading', { level: 1 }).textContent()
  await page.getByRole('link', { name: 'Next day' }).click()
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(String(heading))

  // And back again.
  await page.getByRole('link', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(String(heading))
})

test('an appointment can be marked done and undone', async ({ page }) => {
  await page.goto(`${BASE}/admin`)

  const firstCard = page.locator('section[aria-label="Appointments"] li').first()
  await expect(firstCard).toBeVisible()
  await expect(firstCard.getByText('Booked')).toBeVisible()

  await firstCard.getByRole('button', { name: 'Done' }).click()
  await expect(firstCard.getByText('Done', { exact: false }).first()).toBeVisible()

  await firstCard.getByRole('button', { name: 'Undo' }).click()
  await expect(firstCard.getByText('Booked')).toBeVisible()
})

test('a walk-in can be added from behind the chair', async ({ page }) => {
  await page.goto(`${BASE}/admin`)

  const before = await page.locator('section[aria-label="Appointments"] li').count()

  await page.getByRole('button', { name: 'Book someone in' }).click()
  // Inline panel, not a modal: the diary is still on the page behind it.
  await expect(page.getByRole('heading', { name: 'Book someone in' })).toBeVisible()

  await page.getByRole('button', { name: /^Classic cut/ }).click()
  await page.getByLabel('Start time').fill('17:35')
  await page.getByLabel('Customer name').fill('Walk-in Wally')
  await page.getByRole('button', { name: 'Add to the diary' }).click()

  await expect(page.getByText('Walk-in Wally')).toBeVisible({ timeout: 15_000 })
  expect(await page.locator('section[aria-label="Appointments"] li').count())
    .toBe(before + 1)
})

test('the walk-in form refuses a double booking', async ({ page }) => {
  await page.goto(`${BASE}/admin`)

  // Seeded demo appointments sit at 10:00 for every barber on day one.
  await page.getByRole('button', { name: 'Book someone in' }).click()
  await page.getByRole('button', { name: /^Classic cut/ }).click()
  await page.getByLabel('Start time').fill('10:00')
  await page.getByLabel('Customer name').fill('Clash Test')
  await page.getByRole('button', { name: 'Add to the diary' }).click()

  await expect(page.getByText('already booked', { exact: false }))
    .toBeVisible({ timeout: 15_000 })
})

test('time off can be blocked out and removed', async ({ page }) => {
  await page.goto(`${BASE}/admin/time-off`)
  await expect(page.getByText('Nothing blocked out')).toBeVisible()

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const day = tomorrow.toISOString().slice(0, 10)

  await page.getByLabel('From').fill(`${day}T09:00`)
  await page.getByLabel('Until').fill(`${day}T12:00`)
  await page.getByLabel('Reason').fill('Dentist')
  await page.getByRole('button', { name: 'Block it out' }).click()

  await expect(page.getByText('Dentist')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Remove' }).first().click()
  await expect(page.getByText('Nothing blocked out')).toBeVisible({ timeout: 15_000 })
})

test('configuration screens render and say why they cannot save', async ({ page }) => {
  for (const path of ['/admin/services', '/admin/staff', '/admin/hours', '/admin/settings']) {
    await page.goto(`${BASE}${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }

  await page.goto(`${BASE}/admin/settings`)
  await expect(page.getByText('Demo mode: settings will not save')).toBeVisible()
})

for (const path of ['/admin', '/admin/time-off', '/admin/services', '/admin/settings']) {
  test(`every control on ${path} clears the 44px touch target`, async ({ page }) => {
    await page.goto(`${BASE}${path}`)
    const controls = page.locator('button:visible, a:visible')
    const count = await controls.count()
    expect(count).toBeGreaterThan(2)

    const tooSmall: string[] = []
    for (let i = 0; i < count; i++) {
      const box = await controls.nth(i).boundingBox()
      const label = (await controls.nth(i).textContent())?.trim().slice(0, 30) ?? '?'
      if (box && box.height < 44) tooSmall.push(`${label} (${Math.round(box.height)}px)`)
    }
    expect(tooSmall, `Controls under 44px: ${tooSmall.join(', ')}`).toEqual([])
  })
}
