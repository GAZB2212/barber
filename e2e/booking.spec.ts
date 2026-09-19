import { expect, test } from '@playwright/test'

/**
 * End-to-end cover for the booking flow, run on a phone-sized viewport
 * because that is where the products this replaces fall down.
 *
 * Pixel 7 rather than an iPhone profile: only Chromium is installed here, and
 * emulating an iPhone user agent on Chromium would prove nothing about Safari.
 * Safari-specific behaviour still needs a real device or a WebKit runner.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

test('a customer can book from a phone without ever being trapped', async ({ page }) => {
  await page.goto(`${BASE}/demo/book`)

  await expect(page.getByRole('heading', { name: 'What are you having?' })).toBeVisible()

  // The service list must be reachable by scrolling the page itself. If a
  // modal were locking the body, scrollHeight would not exceed the viewport
  // or the scroll would not move.
  const canScroll = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollable: doc.scrollHeight > window.innerHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(doc).overflow,
      position: getComputedStyle(document.body).position,
    }
  })
  expect(canScroll.scrollable).toBe(true)
  expect(canScroll.bodyOverflow).not.toBe('hidden')
  expect(canScroll.htmlOverflow).not.toBe('hidden')
  expect(canScroll.position).not.toBe('fixed')

  // Scrolling actually moves, and reaches the last service.
  await page.getByRole('button', { name: /Grey blending/ }).scrollIntoViewIfNeeded()
  const scrolled = await page.evaluate(() => window.scrollY)
  expect(scrolled).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: /Grey blending/ })).toBeInViewport()

  // Choose two services.
  await page.getByRole('button', { name: /Skin fade/ }).click()
  await page.getByRole('button', { name: /Beard trim/ }).click()
  await expect(page.getByText('2 services')).toBeVisible()

  await page.getByRole('button', { name: 'Continue' }).click()

  // Barber step.
  await expect(page.getByRole('heading', { name: 'Who with?' })).toBeVisible()
  await page.getByRole('button', { name: /Anyone available/ }).click()

  // Time step.
  await expect(page.getByRole('heading', { name: 'When suits?' })).toBeVisible()
  const firstSlot = page.locator('ul li button', { hasText: /^\d{2}:\d{2}$/ }).first()
  await expect(firstSlot).toBeVisible({ timeout: 15_000 })
  const slotLabel = await firstSlot.textContent()
  await firstSlot.click()

  // Details step.
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  await expect(page.getByText(String(slotLabel))).toBeVisible()
  await page.getByLabel('Your name').fill('Gaz')
  await page.getByLabel('Email').fill('gaz@example.com')
  await page.getByRole('button', { name: 'Confirm booking' }).click()

  // Confirmed.
  await expect(page.getByRole('heading', { name: 'You’re booked in' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Manage this booking' })).toBeVisible()
})

for (const path of ['/demo', '/demo/book']) {
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

test('the booked slot disappears from the list afterwards', async ({ page }) => {
  await page.goto(`${BASE}/demo/book`)
  await page.getByRole('button', { name: /Classic cut/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /Marcus/ }).click()

  const slot = page.locator('ul li button', { hasText: /^\d{2}:\d{2}$/ }).first()
  await expect(slot).toBeVisible({ timeout: 15_000 })
  const taken = (await slot.textContent())!.trim()
  await slot.click()

  await page.getByLabel('Your name').fill('Gaz')
  await page.getByLabel('Email').fill('gaz2@example.com')
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await expect(page.getByRole('heading', { name: 'You’re booked in' })).toBeVisible({ timeout: 15_000 })

  // Same barber, same day: the slot just taken must no longer be offered.
  await page.goto(`${BASE}/demo/book`)
  await page.getByRole('button', { name: /Classic cut/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /Marcus/ }).click()
  await expect(page.locator('ul li button', { hasText: /^\d{2}:\d{2}$/ }).first())
    .toBeVisible({ timeout: 15_000 })

  const offered = await page.locator('ul li button', { hasText: /^\d{2}:\d{2}$/ })
    .allTextContents()
  expect(offered.map((t) => t.trim())).not.toContain(taken)
})
