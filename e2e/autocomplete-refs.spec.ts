import { test, expect } from "@playwright/test"
import { makeLocalStorageValueWithEmptySeq } from "./fixtures/sample-system"

/**
 * Reproduces the bug: UseCase: and Sequence: suggestions do not appear
 * when typing those prefixes in a sequence diagram message label.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem("integra-system", value)
  }, makeLocalStorageValueWithEmptySeq())
  await page.goto("/")
  // Open the empty "New Flow" sequence diagram — starts in edit mode
  await page.getByRole("treeitem").filter({ hasText: "New Flow" }).click()
  const cmEditor = page.locator(".cm-content[contenteditable='true']")
  await expect(cmEditor).toBeVisible()
  await cmEditor.click()
})

test.describe("autocomplete UseCase: and Sequence: refs in sequence diagram", () => {
  test("UseCase: suggestions appear after typing 'UseCase:' in message label", async ({ page }) => {
    // Declare participants then type an arrow line with UseCase: in the label
    await page.keyboard.type("actor User")
    await page.keyboard.press("Enter")
    await page.keyboard.type("component OrderService")
    await page.keyboard.press("Enter")
    await page.keyboard.type("User ->> OrderService: UseCase:")

    // The autocomplete dropdown should appear with a PlaceOrder suggestion
    const dropdown = page.locator(".cm-tooltip-autocomplete")
    await expect(dropdown).toBeVisible({ timeout: 3000 })
    await expect(dropdown).toContainText("UseCase:")
  })

  test("Sequence: suggestions appear after typing 'Sequence:' in message label", async ({ page }) => {
    // The fixture has LoginFlow and NewFlow sequence diagrams under the Login use case.
    // After the fix, Sequence: searches the entire component tree, so these appear
    // regardless of which component receives the message arrow.
    await page.keyboard.type("actor User")
    await page.keyboard.press("Enter")
    await page.keyboard.type("component OrderService")
    await page.keyboard.press("Enter")
    await page.keyboard.type("User ->> OrderService: Sequence:")

    const dropdown = page.locator(".cm-tooltip-autocomplete")
    await expect(dropdown).toBeVisible({ timeout: 3000 })
    await expect(dropdown).toContainText("Sequence:")
  })

  test("function ref suggestions (IAuth:login) still appear normally", async ({ page }) => {
    // Baseline: verify that regular function ref suggestions still work
    await page.keyboard.type("actor User")
    await page.keyboard.press("Enter")
    await page.keyboard.type("component AuthService")
    await page.keyboard.press("Enter")
    await page.keyboard.type("User ->> AuthService: ")

    const dropdown = page.locator(".cm-tooltip-autocomplete")
    await expect(dropdown).toBeVisible({ timeout: 3000 })
    await expect(dropdown).toContainText("IAuth:login()")
  })
})
