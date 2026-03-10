import { test, expect } from "@playwright/test"
import { makeLocalStorageValueWithInheritance } from "./fixtures/sample-system"

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem("integra-system", value)
  }, makeLocalStorageValueWithInheritance())
  await page.goto("/")
})

test.describe("interface inheritance — warning icons on parent component", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to root component (System) which has interfaces
    await page.getByRole("treeitem").filter({ hasText: "System" }).first().click()
    await expect(page.getByTestId("interface-tab-IRootService")).toBeVisible()
  })

  test("interface inherited by a sub-component has no warning icon", async ({ page }) => {
    // IRootService is inherited by AuthService → no warning
    await expect(page.getByTestId("interface-tab-warning-IRootService")).not.toBeVisible()
  })

  test("interface not inherited by any sub-component shows a warning icon", async ({ page }) => {
    // IUnimplemented is not inherited by any sub-component → warning
    await expect(page.getByTestId("interface-tab-warning-IUnimplemented")).toBeVisible()
  })

  test("warning icon tooltip explains the reason", async ({ page }) => {
    const warning = page.getByTestId("interface-tab-warning-IUnimplemented")
    await expect(warning).toHaveAttribute("title", "No sub-component inherits this interface")
  })
})

test.describe("interface inheritance — inherits selector on sub-component", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to AuthService which is a sub-component of System
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).click()
    // Switch to the IAuthDerived tab
    await expect(page.getByTestId("interface-tab-IAuthDerived")).toBeVisible()
    await page.getByTestId("interface-tab-IAuthDerived").click()
  })

  test("inherits selector is visible and shows parent interface options", async ({ page }) => {
    const select = page.getByTestId("inherits-select")
    await expect(select).toBeVisible()
    await expect(select.locator("option")).toHaveCount(3) // "— none —" + IRootService + IUnimplemented
  })

  test("inherits selector shows the currently inherited parent interface as selected", async ({ page }) => {
    const select = page.getByTestId("inherits-select")
    await expect(select).toHaveValue("root-iface-uuid")
  })

  test("inherited functions are displayed in the interface panel", async ({ page }) => {
    // doThing is defined on IRootService and should appear via the InheritedInterface getter
    await expect(page.getByTestId("interface-tab-panel")).toContainText("doThing")
  })

  test("inherited functions show the 'inherited' badge", async ({ page }) => {
    await expect(page.getByTestId("interface-tab-panel")).toContainText("inherited")
  })

  test("inherited functions have no editable ID input", async ({ page }) => {
    const panel = page.getByTestId("interface-tab-panel")
    // In read-only mode the function ID is a <span>, not an <input aria-label="Function ID">
    await expect(panel.getByLabel("Function ID")).not.toBeVisible()
    await expect(panel.locator("span").filter({ hasText: "doThing" })).toBeVisible()
  })

  test("inherited functions have no delete button", async ({ page }) => {
    await expect(page.getByTestId("fn-delete-btn")).not.toBeVisible()
  })
})

test.describe("interface inheritance — non-inheriting interface shows selector with no selection", () => {
  test("IAuth tab on AuthService shows inherits selector with no selection", async ({ page }) => {
    await page.getByRole("treeitem").filter({ hasText: "AuthService" }).click()
    await expect(page.getByTestId("interface-tab-IAuth")).toBeVisible()
    await page.getByTestId("interface-tab-IAuth").click()

    const select = page.getByTestId("inherits-select")
    await expect(select).toBeVisible()
    // No parent interface selected
    await expect(select).toHaveValue("")
  })
})

test.describe("interface inheritance — component with no parent shows no selector", () => {
  test("root component interface shows no inherits selector", async ({ page }) => {
    await page.getByRole("treeitem").filter({ hasText: "System" }).first().click()
    await page.getByTestId("interface-tab-IRootService").click()
    // Root has no parent so selector should not appear
    await expect(page.getByTestId("inherits-select")).not.toBeVisible()
  })
})
