import { test, expect } from "@playwright/test"
import { makeLocalStorageValue } from "./fixtures/sample-system"

// The sample fixture has: System > Main Use Cases > Login (use-case) > Login Flow (sequence-diagram)
// Selecting "Login" should render a class diagram in the bottom panel.

test.describe("use case class diagram", () => {
  test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")
    await page.getByRole("treeitem").filter({ hasText: "Login" }).first().click()
  })

  test("bottom panel renders when a use-case node is selected", async ({ page }) => {
    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await expect(svgContainer).toBeVisible({ timeout: 5000 })
  })

  test("class diagram contains an SVG", async ({ page }) => {
    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    const svg = svgContainer.locator("svg")
    await expect(svg).toBeVisible()
  })

  test("class diagram SVG has non-trivial content", async ({ page }) => {
    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    // SVG should have visible height (not an empty collapsed element)
    const svgHeight = await svgContainer.locator("svg").evaluate((el) => el.getBoundingClientRect().height)
    expect(svgHeight).toBeGreaterThan(10)

    // Should contain at least one class node rendered by Mermaid
    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(0)
  })

  test("no mermaid error banner is shown", async ({ page }) => {
    // Wait for diagram to attempt to render
    await page.waitForTimeout(2000)
    const errorBanner = page.locator("text=Parse error").or(page.locator("text=Invalid Diagram"))
    await expect(errorBanner).not.toBeVisible()
  })
})
