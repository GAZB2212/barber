// Captures the booking flow at phone width. Usage:
//   SHOT_DIR=./shots node scripts/screenshots.mjs

import { chromium, devices } from '@playwright/test'

const OUT = process.env.SHOT_DIR
const BASE = 'http://127.0.0.1:3100'
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH })
const page = await browser.newPage({ ...devices['Pixel 7'] })

await page.goto(`${BASE}/demo`)
await page.screenshot({ path: `${OUT}/1-shop.png`, fullPage: true })

await page.goto(`${BASE}/demo/book`)
await page.screenshot({ path: `${OUT}/2-services.png`, fullPage: true })

await page.getByRole('button', { name: /Skin fade/ }).click()
await page.getByRole('button', { name: /Beard trim/ }).click()
await page.screenshot({ path: `${OUT}/3-services-selected.png` })

await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/4-barber.png`, fullPage: true })

await page.getByRole('button', { name: /Dee/ }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/5-time.png`, fullPage: true })

await page.locator('ul li button', { hasText: /^\d{2}:\d{2}$/ }).first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/6-details.png`, fullPage: true })

await page.getByLabel('Your name').fill('Gaz')
await page.getByLabel('Email', { exact: true }).fill('gaz@example.com')
await page.getByRole('button', { name: 'Confirm booking' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/7-confirmed.png`, fullPage: true })

await page.getByRole('link', { name: 'Manage this booking' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/8-manage.png`, fullPage: true })

// Dashboard
await page.goto(`${BASE}/admin`)
await page.screenshot({ path: `${OUT}/9-diary.png`, fullPage: true })

await page.getByRole('button', { name: 'Book someone in' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/10-walk-in.png`, fullPage: true })

await page.goto(`${BASE}/admin/services`)
await page.screenshot({ path: `${OUT}/11-services.png`, fullPage: true })

await page.goto(`${BASE}/admin/settings`)
await page.screenshot({ path: `${OUT}/12-settings.png`, fullPage: true })

await browser.close()
console.log('shots done')
