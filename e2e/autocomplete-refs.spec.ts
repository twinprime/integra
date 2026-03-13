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
    const cmEditor = page.locator(".cm-content[contenteditable='true']")
    // Declare participants then type an arrow line with UseCase: in the label
    await cmEditor.type("actor User")
    await cmEditor.press("Enter")
    await cmEditor.type("component OrderService")
    await cmEditor.press("Enter")
    await cmEditor.type("User ->> OrderService: UseCase:")

    // The autocomplete dropdown should appear with a PlaceOrder suggestion
    const dropdown = page.locator(".cm-tooltip-autocomplete")
    await expect(dropdown).toBeVisible({ timeout: 3000 })
    await expect(dropdown).toContainText("UseCase:")
  })

  test("Sequence: suggestions appear after typing 'Sequence:' in message label", async ({ page }) => {
    const cmEditor = page.locator(".cm-content[contenteditable='true']")
    // The fixture has LoginFlow and NewFlow sequence diagrams under the Login use case.
    // After the fix, Sequence: searches the entire component tree, so these appear
    // regardless of which component receives the message arrow.
    await cmEditor.type("actor User")
    await cmEditor.press("Enter")
    await cmEditor.type("component OrderService")
    await cmEditor.press("Enter")
    await cmEditor.type("User ->> OrderService: Sequence:")

    const dropdown = page.locator(".cm-tooltip-autocomplete")
    await expect(dropdown).toBeVisible({ timeout: 3000 })
    await expect(dropdown).toContainText("Sequence:")
  })

  test("function ref suggestions (IAuth:login) still appear normally", async ({ page }) => {
    const cmEditor = page.locator(".cm-content[contenteditable='true']")
    // Baseline: verify that regular function ref suggestions still work
    await cmEditor.type("actor User")
    await cmEditor.press("Enter")
    await cmEditor.type("component AuthService")
    await cmEditor.press("Enter")
    await cmEditor.type("User ->> AuthService: ")

    const dropdown = page.locator(".cm-tooltip-autocomplete")
    await expect(dropdown).toBeVisible({ timeout: 3000 })
    await expect(dropdown).toContainText("IAuth:login()")
  })
})
