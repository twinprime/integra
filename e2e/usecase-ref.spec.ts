import { test, expect } from "@playwright/test"
import { makeLocalStorageValue, UUIDS } from "./fixtures/sample-system"

const diagram = () => '[data-testid="diagram-svg-container"]'

test.beforeEach(async ({ page }) => {
  const lsValue = makeLocalStorageValue()
  await page.addInitScript((value) => {
    localStorage.setItem("integra-system", value)
  }, lsValue)
})

test.describe("UseCase path reference in sequence diagram", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    // Navigate to Login Flow sequence diagram (nested under Login > Main Use Cases)
    await page.getByRole("treeitem").filter({ hasText: "Login Flow" }).click()
    await page.locator(`${diagram()} svg`).waitFor()
  })

  test("renders UseCase path reference message label in diagram", async ({ page }) => {
    // The UseCaseRef "UseCase:OrderService/PlaceOrder:Place an order" should render
    // using the custom label "Place an order"
    await expect(
      page.locator(diagram()).locator("text.messageText").filter({ hasText: /Place an order/ }),
    ).toBeVisible()
  })

  test("clicking UseCase path reference navigates to the referenced use case", async ({ page }) => {
    await page
      .locator(diagram())
      .locator("text.messageText")
      .filter({ hasText: /Place an order/ })
      .first()
      .click()
    // PlaceOrder use case belongs to OrderService — that node should now be selected
    const placeOrderItem = page
      .getByRole("treeitem")
      .filter({ hasText: "Place Order" })
      .first()
    await expect(placeOrderItem).toHaveAttribute("aria-selected", "true")
    void UUIDS // ensure fixture is imported
  })
})
