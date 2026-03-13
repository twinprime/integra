import { test, expect } from "@playwright/test"
import { makeLocalStorageValueWithEmptySeq } from "./fixtures/sample-system"

test.beforeEach(async ({ page }) => {
  const lsValue = makeLocalStorageValueWithEmptySeq()
  await page.addInitScript((value) => {
    localStorage.setItem("integra-system", value)
  }, lsValue)
  await page.goto("/")
})

test.describe("auto-create missing path nodes", () => {
  test("typing a component path reference auto-creates the missing component in the tree", async ({ page }) => {
    // Navigate to the empty "New Flow" sequence diagram (no content → starts in edit mode)
    await page.getByRole("treeitem").filter({ hasText: "New Flow" }).click()

    // The editor should be in edit mode (empty content)
    const cmEditor = page.locator(".cm-content[contenteditable='true']")
    await expect(cmEditor).toBeVisible()

    // Type a spec referencing a new sub-component under AuthService that doesn't yet exist
    await cmEditor.click()
    await cmEditor.type([
      "actor User",
      "component AuthService",
      "component AuthService/NewModule",
      "User --> AuthService: hello",
    ].join("\n"))

    // Save by clicking outside (blur)
    await page.locator("body").click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)

    // Assert "NewModule" appears as a tree item (auto-created under AuthService)
    await expect(
      page.getByRole("treeitem").filter({ hasText: "NewModule" }),
    ).toBeVisible()
  })

  test("typing an actor path reference auto-creates the actor under the target component", async ({ page }) => {
    await page.getByRole("treeitem").filter({ hasText: "New Flow" }).click()

    const cmEditor = page.locator(".cm-content[contenteditable='true']")
    await expect(cmEditor).toBeVisible()

    await cmEditor.click()
    await cmEditor.type([
      "actor AuthService/AdminUser",
      "component AuthService",
      "AdminUser --> AuthService: hello",
    ].join("\n"))

    // Save by clicking outside (blur)
    await page.locator("body").click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)

    // "AdminUser" actor should appear in the tree under AuthService
    await expect(
      page.getByRole("treeitem").filter({ hasText: "AdminUser" }),
    ).toBeVisible()
  })
})
