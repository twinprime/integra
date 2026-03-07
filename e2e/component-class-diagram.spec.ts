import { test, expect } from "@playwright/test"
import {
  makeLocalStorageValue,
  makeLocalStorageValueWithBlockOnlyCall,
  makeLocalStorageValueWithDependency,
} from "./fixtures/sample-system"

// The sample fixture has: System > AuthService (component with IAuth interface)
// The Login Flow sequence diagram has: User ->> AuthService: IAuth:login()
// Selecting "AuthService" should show the component class diagram in the bottom panel.

test.describe("component class diagram", () => {
  test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()
  })

  test("bottom panel renders when a component node is selected", async ({ page }) => {
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

    const svgHeight = await svgContainer.locator("svg").evaluate((el) => el.getBoundingClientRect().height)
    expect(svgHeight).toBeGreaterThan(10)

    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(0)
  })

  test("no mermaid error banner is shown", async ({ page }) => {
    await page.waitForTimeout(2000)
    const errorBanner = page.locator("text=Parse error").or(page.locator("text=Invalid Diagram"))
    await expect(errorBanner).not.toBeVisible()
  })
})

test.describe("component class diagram — block message support", () => {
  test("includes callers from inside opt blocks in the diagram", async ({ page }) => {
    const lsValue = makeLocalStorageValueWithBlockOnlyCall()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")

    // Select AuthService — the only IAuth:login() call is inside an opt block
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    // The SVG should render (not show "No interfaces" state) because User is a caller
    const svg = svgContainer.locator("svg")
    await expect(svg).toBeVisible()

    // Should have non-trivial content (more than one class node: AuthService + IAuth + User)
    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(1)
  })
})

test.describe("component class diagram — dependency arrows", () => {
  test("shows outgoing dependency components and interfaces when component calls another", async ({ page }) => {
    const lsValue = makeLocalStorageValueWithDependency()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")

    // Select AuthService which now calls OrderService.IOrder:process()
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    const svg = svgContainer.locator("svg")
    await expect(svg).toBeVisible()

    // Should have more class nodes: AuthService (subject) + IAuth + User (dependent) + IOrder + OrderService (dependencies)
    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(2)
  })
})
