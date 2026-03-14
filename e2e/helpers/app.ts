import type { Page } from "@playwright/test"

export async function loadAppWithFixture(page: Page, value: string): Promise<void> {
  await page.addInitScript((storageValue) => {
    localStorage.setItem("integra-system", storageValue)
  }, value)
  await page.goto("/")
}

export async function gotoHome(page: Page): Promise<void> {
  await page.goto("/")
}
