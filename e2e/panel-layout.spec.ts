import { test, expect, type Locator, type Page } from "@playwright/test"
import { makeLocalStorageValue } from "./fixtures/sample-system"
import { loadAppWithFixture } from "./helpers/app"
import { selectTreeItem } from "./helpers/interactions"

function selectedTreeItem(page: Page): Locator {
  return page.locator('[role="treeitem"][aria-selected="true"]')
}

async function boxFor(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

test.describe("panel layout controls", () => {
  test.beforeEach(async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValue())
    await selectTreeItem(page, "AuthService")
  })

  test("positions the horizontal splitter below the specification editor when opening a diagram", async ({ page }) => {
    await selectTreeItem(page, "User")
    await selectTreeItem(page, "Login Flow")

    const specificationBox = await boxFor(page.getByLabel("Specification"))
    const splitterToggleBox = await boxFor(page.getByTitle("Expand bottom panel"))

    expect(splitterToggleBox.y).toBeGreaterThanOrEqual(specificationBox.y + specificationBox.height - 1)
  })

  test("collapses and restores the explorer panel", async ({ page }) => {
    const toggle = page.getByTitle("Expand right panel")
    const initialBox = await boxFor(toggle)

    await toggle.click()
    const restore = page.getByTitle("Restore panels")
    await expect(restore).toBeVisible()
    const collapsedBox = await boxFor(restore)
    expect(collapsedBox.x).toBeLessThan(initialBox.x - 50)

    await restore.click()
    await expect(toggle).toBeVisible()
    const restoredBox = await boxFor(toggle)
    expect(Math.abs(restoredBox.x - initialBox.x)).toBeLessThan(20)
    await expect(selectedTreeItem(page)).toContainText("AuthService")
  })

  test("collapses and restores the editor pane while keeping visualization visible", async ({ page }) => {
    const toggle = page.getByTitle("Expand bottom panel")
    const initialBox = await boxFor(toggle)

    await toggle.click()
    const restore = page.getByTitle("Restore panels")
    await expect(restore).toBeVisible()
    const collapsedBox = await boxFor(restore)
    expect(collapsedBox.y).toBeLessThan(initialBox.y - 100)
    await expect(page.getByText("Visualization")).toBeVisible()

    await restore.click()
    await expect(toggle).toBeVisible()
    const restoredBox = await boxFor(toggle)
    expect(Math.abs(restoredBox.y - initialBox.y)).toBeLessThan(20)
  })

  test("collapses and restores the visualization pane while keeping the editor visible", async ({ page }) => {
    const toggle = page.getByTitle("Expand top panel")
    const initialBox = await boxFor(toggle)

    await toggle.click()
    const restore = page.getByTitle("Restore panels")
    await expect(restore).toBeVisible()
    const collapsedBox = await boxFor(restore)
    expect(collapsedBox.y).toBeGreaterThan(initialBox.y + 100)
    await expect(page.getByLabel("Node name")).toHaveValue("AuthService")

    await restore.click()
    await expect(toggle).toBeVisible()
    const restoredBox = await boxFor(toggle)
    expect(Math.abs(restoredBox.y - initialBox.y)).toBeLessThan(20)
  })
})
