import { test, expect } from "@playwright/test"
import { makeLocalStorageValue } from "./fixtures/sample-system"

const diagram = () => '[data-testid="diagram-svg-container"]'

test.beforeEach(async ({ page }) => {
  const lsValue = makeLocalStorageValue()
  await page.addInitScript((value) => {
    localStorage.setItem("integra-system", value)
  }, lsValue)
})

// ─── Use-case diagram ─────────────────────────────────────────────────────────

test.describe("use-case diagram entity clicks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    // Select the use-case diagram node in the tree (all nodes start expanded)
    await page.getByRole("treeitem").filter({ hasText: "Main Use Cases" }).click()
    // Wait for Mermaid SVG to finish rendering
    await page.locator(`${diagram()} svg`).waitFor()
  })

  test("clicking actor node navigates to actor", async ({ page }) => {
    // Mermaid v11 graph TD renders node labels inside foreignObject, not SVG <text>
    // Use getByText to find the label in the foreignObject HTML, or target the node group by ID
    await page.locator(diagram()).locator('[id*="flowchart-User"]').click()
    const treeItem = page.getByRole("treeitem").filter({ hasText: "User" }).first()
    await expect(treeItem).toHaveAttribute("aria-selected", "true")
  })

  test("clicking use-case node navigates to use-case", async ({ page }) => {
    await page.locator(diagram()).locator('[id*="flowchart-Login"]').click()
    // The use-case "Login" should become selected
    await expect(page.locator(`[role="treeitem"][aria-selected="true"]`)).toContainText("Login")
  })
})

// ─── Sequence diagram ─────────────────────────────────────────────────────────

test.describe("sequence diagram entity clicks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    // "Login Flow" is nested under Login > Main Use Cases; all nodes start expanded
    await page.getByRole("treeitem").filter({ hasText: "Login Flow" }).click()
    // Wait for Mermaid SVG to finish rendering
    await page.locator(`${diagram()} svg`).waitFor()
  })

  test("clicking participant box navigates to component", async ({ page }) => {
    // Click the actor label text for AuthService; the handler walks up to find the rect
    await page
      .locator(diagram())
      .locator("text.actor")
      .filter({ hasText: /AuthService/ })
      .first()
      .click()
    const authItem = page.getByRole("treeitem").filter({ hasText: "AuthService" }).first()
    await expect(authItem).toHaveAttribute("aria-selected", "true")
  })

  test("clicking function message label navigates to interface owner", async ({ page }) => {
    await page
      .locator(diagram())
      .locator("text.messageText")
      .filter({ hasText: /^login\(\)$/ })
      .first()
      .click()
    // IAuth belongs to AuthService — that component should now be selected
    const authItem = page.getByRole("treeitem").filter({ hasText: "AuthService" }).first()
    await expect(authItem).toHaveAttribute("aria-selected", "true")
  })

  test("clicking function message label activates the corresponding interface tab", async ({ page }) => {
    await page
      .locator(diagram())
      .locator("text.messageText")
      .filter({ hasText: /^login\(\)$/ })
      .first()
      .click()
    // AuthService should be selected and its IAuth tab should be active (blue border)
    await expect(page.getByTestId("interface-tab-IAuth")).toHaveClass(/border-blue-400/)
  })
})

// ─── Navigation sanity check ──────────────────────────────────────────────────

test("clicking diagram entity does not navigate when uuid is unresolvable", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("treeitem").filter({ hasText: "Login Flow" }).click()
  await page.locator(`${diagram()} svg`).waitFor()

  // Click a non-navigable area (the SVG background)
  await page.locator(`${diagram()} svg`).click({ position: { x: 5, y: 5 } })
  // No treeitem should have become selected (Login Flow diagram node was already selected)
  const loginFlowItem = page.getByRole("treeitem").filter({ hasText: "Login Flow" }).first()
  await expect(loginFlowItem).toHaveAttribute("aria-selected", "true")
})

// ─── Spec editor (CodeMirror) function link navigation ────────────────────────

test.describe("spec editor function link navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    // Select the Login Flow sequence diagram to show its spec in the editor
    await page.getByRole("treeitem").filter({ hasText: "Login Flow" }).click()
  })

  test("clicking a function link in the spec editor navigates to the interface owner", async ({ page }) => {
    // The spec editor renders syntax-highlighted tokens; IAuth:login() is a .cm-integra-fn token
    const fnToken = page.locator(".cm-integra-fn").first()
    await expect(fnToken).toBeVisible()
    await fnToken.click()
    // AuthService should now be selected in the tree
    const authItem = page.getByRole("treeitem").filter({ hasText: "AuthService" }).first()
    await expect(authItem).toHaveAttribute("aria-selected", "true")
  })

  test("clicking a function link in the spec editor activates the corresponding interface tab", async ({ page }) => {
    const fnToken = page.locator(".cm-integra-fn").first()
    await expect(fnToken).toBeVisible()
    await fnToken.click()
    // The IAuth tab in the component editor should be active
    await expect(page.getByTestId("interface-tab-IAuth")).toHaveClass(/border-blue-400/)
  })
})
