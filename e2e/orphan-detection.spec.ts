import { test, expect } from "@playwright/test"
import {
  makeLocalStorageValue,
  makeLocalStorageValueWithOrphanedActor,
} from "./fixtures/sample-system"

// ─── Referenced actor — no delete button ────────────────────────────────────

test.describe("orphan detection & deletion", () => {
  test("referenced actor has no delete button on hover", async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, makeLocalStorageValue())
    await page.goto("/")

    // Hover over the "User" actor in the tree
    const userItem = page.getByRole("treeitem").filter({ hasText: /^User$/ }).first()
    await userItem.hover()

    // Delete button must NOT exist — User is referenced in diagrams
    await expect(page.getByTitle('Delete "User"')).toHaveCount(0)
  })

  // ─── Orphaned actor — delete button visible ────────────────────────────────

  test("orphaned actor shows delete button on hover", async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, makeLocalStorageValueWithOrphanedActor())
    await page.goto("/")

    // Hover over "GhostUser" — not referenced in any diagram
    const ghostItem = page.getByRole("treeitem").filter({ hasText: /^GhostUser$/ }).first()
    await ghostItem.hover()

    // Delete button must be visible
    await expect(page.getByTitle('Delete "GhostUser"')).toBeVisible()
  })

  // ─── Deleting orphan removes it from tree ─────────────────────────────────

  test("clicking delete on orphaned actor removes it from the tree", async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, makeLocalStorageValueWithOrphanedActor())
    await page.goto("/")

    // Confirm GhostUser is in the tree
    const ghostItem = page.getByRole("treeitem").filter({ hasText: /^GhostUser$/ }).first()
    await expect(ghostItem).toBeVisible()

    // Hover to reveal the delete button and click it
    await ghostItem.hover()
    await page.getByTitle('Delete "GhostUser"').click()

    // GhostUser must no longer appear in the tree
    await expect(page.getByRole("treeitem").filter({ hasText: /^GhostUser$/ })).toHaveCount(0)
  })

  // ─── Referenced component — no delete button ──────────────────────────────

  test("referenced component has no delete button on hover", async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, makeLocalStorageValue())
    await page.goto("/")

    // AuthService is referenced in the Login Flow sequence diagram
    const authItem = page.getByRole("treeitem").filter({ hasText: /^AuthService$/ }).first()
    await authItem.hover()

    await expect(page.getByTitle('Delete "AuthService"')).toHaveCount(0)
  })

  // ─── Use-case-diagram with referenced use case — no delete button ──────────

  test("use-case-diagram whose use case is referenced by a sequence diagram has no delete button", async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("integra-system", value)
    }, makeLocalStorageValue())
    await page.goto("/")

    // "Order Use Cases" contains PlaceOrder, which is referenced via UseCase: in the Login Flow sequence.
    // isUseCaseReferenced returns true for PlaceOrder → isNodeOrphaned returns false → no delete button.
    const orderUcdItem = page.getByRole("treeitem").filter({ hasText: /^Order Use Cases$/ }).first()
    await orderUcdItem.hover()

    await expect(page.getByTitle('Delete "Order Use Cases"')).toHaveCount(0)

    // "Main Use Cases" contains Login, which is NOT referenced in any sequence diagram's
    // referencedNodeIds → isNodeOrphaned returns true → delete button IS shown.
    const mainUcdItem = page.getByRole("treeitem").filter({ hasText: /^Main Use Cases$/ }).first()
    await mainUcdItem.hover()

    await expect(page.getByTitle('Delete "Main Use Cases"')).toBeVisible()
  })
})
