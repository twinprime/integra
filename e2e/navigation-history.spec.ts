import { test, expect } from "@playwright/test"
import { makeLocalStorageValue } from "./fixtures/sample-system"

test.beforeEach(async ({ page }) => {
  const lsValue = makeLocalStorageValue()
  await page.addInitScript((value) => {
    localStorage.setItem("integra-system", value)
  }, lsValue)
  await page.goto("/")
})

const backBtn = (page: import("@playwright/test").Page) =>
  page.getByTitle("Go back (Alt+←)")
const forwardBtn = (page: import("@playwright/test").Page) =>
  page.getByTitle("Go forward (Alt+→)")

test.describe("navigation history", () => {
  test("initial state: Back button is disabled when only one node visited", async ({ page }) => {
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()
    await expect(backBtn(page)).toBeDisabled()
    await expect(forwardBtn(page)).toBeDisabled()
  })

  test("Back button: navigates to previous node", async ({ page }) => {
    // Navigate: System → AuthService → OrderService
    await page.getByRole("treeitem").filter({ hasText: /^System$/ }).first().click()
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()
    await page.getByRole("treeitem").filter({ hasText: "OrderService" }).first().click()

    // Verify Back is now enabled
    await expect(backBtn(page)).toBeEnabled()

    // Click Back → should land on AuthService
    await backBtn(page).click()
    await expect(
      page.getByRole("treeitem").filter({ hasText: "AuthService" }).first()
    ).toHaveAttribute("aria-selected", "true")
  })

  test("Forward button: navigates forward after going back", async ({ page }) => {
    // Navigate: AuthService → OrderService → Back → Forward
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()
    await page.getByRole("treeitem").filter({ hasText: "OrderService" }).first().click()

    await backBtn(page).click()
    await expect(
      page.getByRole("treeitem").filter({ hasText: "AuthService" }).first()
    ).toHaveAttribute("aria-selected", "true")

    await expect(forwardBtn(page)).toBeEnabled()
    await forwardBtn(page).click()
    await expect(
      page.getByRole("treeitem").filter({ hasText: "OrderService" }).first()
    ).toHaveAttribute("aria-selected", "true")
  })

  test("Alt+← shortcut: navigates back", async ({ page }) => {
    // Click two nodes; clicking in the tree marks it active for keyboard shortcuts
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()
    await page.getByRole("treeitem").filter({ hasText: "OrderService" }).first().click()

    // Press Alt+← to go back
    await page.keyboard.press("Alt+ArrowLeft")
    await expect(
      page.getByRole("treeitem").filter({ hasText: "AuthService" }).first()
    ).toHaveAttribute("aria-selected", "true")
  })

  test("Forward stack resets after navigating to a new node", async ({ page }) => {
    // Navigate: AuthService → OrderService → Back (now at AuthService) → User
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()
    await page.getByRole("treeitem").filter({ hasText: "OrderService" }).first().click()

    await backBtn(page).click()
    await expect(
      page.getByRole("treeitem").filter({ hasText: "AuthService" }).first()
    ).toHaveAttribute("aria-selected", "true")

    // Navigate to a new node — forward stack should reset
    await page.getByRole("treeitem").filter({ hasText: /^User$/ }).first().click()
    await expect(forwardBtn(page)).toBeDisabled()
  })
})
