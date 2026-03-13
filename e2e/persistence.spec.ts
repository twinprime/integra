import { test, expect } from "@playwright/test"
import { makeLocalStorageValue, sampleSystem } from "./fixtures/sample-system"

// ─── 1. State survives reload ─────────────────────────────────────────────────

test("state survives a page reload", async ({ page }) => {
  // Seed localStorage before the app boots
  const lsValue = makeLocalStorageValue()
  await page.addInitScript((value) => {
    localStorage.setItem("integra-system", value)
  }, lsValue)

  await page.goto("/")

  // Fixture root component and a sub-component should be visible in the tree
  await expect(page.getByRole("treeitem").filter({ hasText: sampleSystem.name })).toBeVisible()
  await expect(page.getByRole("treeitem").filter({ hasText: "AuthService" })).toBeVisible()

  // Reload WITHOUT re-seeding localStorage — the app must restore from what it saved
  await page.reload()

  await expect(page.getByRole("treeitem").filter({ hasText: sampleSystem.name })).toBeVisible()
  await expect(page.getByRole("treeitem").filter({ hasText: "AuthService" })).toBeVisible()
})

// ─── 2. State updates are auto-saved ─────────────────────────────────────────

test("auto-save persists a rename across reload", async ({ page }) => {
  const lsValue = makeLocalStorageValue()
  // Seed via evaluate (not addInitScript) so it only runs once — not on subsequent reloads
  await page.goto("/")
  await page.evaluate((value) => {
    localStorage.setItem("integra-system", value)
  }, lsValue)
  await page.reload()

  // Rename the "Login" use-case to "SignIn"
  await page.getByRole("treeitem").filter({ hasText: "Login" }).first().click()
  const nameInput = page.getByLabel("Name")
  await nameInput.clear()
  await nameInput.fill("SignIn")
  await nameInput.press("Tab") // commit the change

  // Give Zustand persist middleware a moment to write to localStorage
  await page.waitForTimeout(300)

  // Reload — no localStorage seeding here; app must restore from auto-save
  await page.reload()

  // The renamed node should still appear under the tree
  await expect(page.getByRole("treeitem").filter({ hasText: "SignIn" })).toBeVisible()
  await expect(page.getByRole("treeitem").filter({ hasText: /^Login$/ })).not.toBeVisible()
})

// ─── 3. Clear system resets state ────────────────────────────────────────────

test("clear system resets to default state and clears localStorage", async ({ page }) => {
  const lsValue = makeLocalStorageValue()
  // Seed via evaluate (not addInitScript) so it only runs once — not on subsequent reloads
  await page.goto("/")
  await page.evaluate((value) => {
    localStorage.setItem("integra-system", value)
  }, lsValue)
  await page.reload()

  // Confirm fixture is loaded
  await expect(page.getByRole("treeitem").filter({ hasText: "AuthService" })).toBeVisible()

  // Click the "Clear system" toolbar button
  await page.getByTitle("Clear system").click()

  // After clearing, fixture nodes should be gone and default root visible
  await expect(page.getByRole("treeitem").filter({ hasText: "AuthService" })).not.toBeVisible()
  await expect(page.getByRole("treeitem").filter({ hasText: "My System" })).toBeVisible()

  // Reload — cleared state (default) must persist, not bring back the old fixture
  await page.reload()

  await expect(page.getByRole("treeitem").filter({ hasText: "AuthService" })).not.toBeVisible()
  await expect(page.getByRole("treeitem").filter({ hasText: "My System" })).toBeVisible()
})

// ─── 4. Fresh page has default state ─────────────────────────────────────────

test("fresh page with no localStorage shows default state without errors", async ({ page }) => {
  // Navigate without setting any localStorage — browser starts clean
  await page.goto("/")

  // Default initial root component should be visible
  await expect(page.getByRole("treeitem").filter({ hasText: "My System" })).toBeVisible()

  // No error indicators in the page
  await expect(page.getByText("Error")).not.toBeVisible()
  await expect(page.getByText("undefined")).not.toBeVisible()
})
