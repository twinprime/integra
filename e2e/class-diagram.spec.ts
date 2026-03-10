import { test, expect, type Page } from "@playwright/test"
import {
  makeLocalStorageValue,
  makeLocalStorageValueWithBlockOnlyCall,
  makeLocalStorageValueWithDependency,
} from "./fixtures/sample-system"

// ─── Shared helper ────────────────────────────────────────────────────────────

function runClassDiagramTests(selectNode: (page: Page) => Promise<void>) {
  test("class diagram contains an SVG", async ({ page }) => {
    await selectNode(page)
    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    await expect(svgContainer.locator("svg")).toBeVisible()
  })

  test("class diagram SVG has non-trivial content", async ({ page }) => {
    await selectNode(page)
    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })

    const svgHeight = await svgContainer.locator("svg").evaluate((el) => el.getBoundingClientRect().height)
    expect(svgHeight).toBeGreaterThan(10)

    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(0)
  })

  test("no mermaid error banner is shown", async ({ page }) => {
    await selectNode(page)
    await page.waitForTimeout(2000)
    const errorBanner = page.locator("text=Parse error").or(page.locator("text=Invalid Diagram"))
    await expect(errorBanner).not.toBeVisible()
  })
}

// ─── Component node ───────────────────────────────────────────────────────────

test.describe("component class diagram", () => {
  test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")
  })

  runClassDiagramTests((page) =>
    page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()
  )
})

// ─── Use-case node ────────────────────────────────────────────────────────────

test.describe("use case class diagram", () => {
  test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")
  })

  runClassDiagramTests((page) =>
    page.getByRole("treeitem").filter({ hasText: "Login" }).first().click()
  )
})

// ─── Block message support ────────────────────────────────────────────────────

test.describe("component class diagram — block message support", () => {
  test("includes callers from inside opt blocks in the diagram", async ({ page }) => {
    const lsValue = makeLocalStorageValueWithBlockOnlyCall()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")

    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    await expect(svgContainer.locator("svg")).toBeVisible()

    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(1)
  })
})

// ─── Dependency arrows ────────────────────────────────────────────────────────

test.describe("component class diagram — dependency arrows", () => {
  test("shows outgoing dependency components and interfaces when component calls another", async ({ page }) => {
    const lsValue = makeLocalStorageValueWithDependency()
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, lsValue)
    await page.goto("/")

    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).first().click()

    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 5000 })
    await expect(svgContainer.locator("svg")).toBeVisible()

    const classNodes = svgContainer.locator(".classGroup, .node, g.classBox")
    expect(await classNodes.count()).toBeGreaterThan(2)
  })
})
