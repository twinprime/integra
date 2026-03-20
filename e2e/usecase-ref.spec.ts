import { test, expect } from '@playwright/test'
import {
    makeLocalStorageValue,
    makeLocalStorageValueWithUseCaseDiagramRef,
    UUIDS,
} from './fixtures/sample-system'
import { selectTreeItem } from './helpers/interactions'

const diagram = () => '[data-testid="diagram-svg-container"]'

test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
        localStorage.setItem('integra-system', value)
    }, lsValue)
})

test.describe('UseCase path reference in sequence diagram', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await selectTreeItem(page, 'Login Flow')
        await page.locator(`${diagram()} svg`).waitFor()
    })

    test('renders UseCase path reference message label in diagram', async ({ page }) => {
        // The UseCaseRef "UseCase:OrderService/PlaceOrder:Place an order" should render
        // using the custom label "Place an order"
        await expect(
            page
                .locator(diagram())
                .locator('text.messageText')
                .filter({ hasText: /Place an order/ })
        ).toBeVisible()
    })

    test('clicking UseCase path reference navigates to the referenced use case', async ({
        page,
    }) => {
        await page
            .locator(diagram())
            .locator('text.messageText')
            .filter({ hasText: /Place an order/ })
            .first()
            .click()
        // PlaceOrder use case belongs to OrderService — that node should now be selected
        const placeOrderItem = page.getByRole('treeitem').filter({ hasText: 'Place Order' }).first()
        await expect(placeOrderItem).toHaveAttribute('aria-selected', 'true')
        void UUIDS // ensure fixture is imported
    })
})

test.describe('UseCaseDiagram path reference in sequence specification preview', () => {
    test.beforeEach(async ({ page }) => {
        const lsValue = makeLocalStorageValueWithUseCaseDiagramRef()
        await page.addInitScript((value) => {
            localStorage.setItem('integra-system', value)
        }, lsValue)
        await page.goto('/')
        await selectTreeItem(page, 'Login Flow')
        await page.locator('[data-testid="cm-editor-container"]').waitFor()
    })

    test('renders UseCaseDiagram path references with syntax highlighting in preview mode', async ({
        page,
    }) => {
        const token = page
            .locator('.cm-integra-fn')
            .filter({ hasText: 'UseCaseDiagram:OrderService/OrderUCD' })
        await expect(token).toBeVisible()
    })

    test('clicking UseCaseDiagram path reference in preview mode navigates to the referenced use case diagram', async ({
        page,
    }) => {
        await page
            .locator('.cm-integra-fn')
            .filter({ hasText: 'UseCaseDiagram:OrderService/OrderUCD' })
            .click()

        const orderUcdItem = page
            .getByRole('treeitem')
            .filter({ hasText: 'Order Use Cases' })
            .first()
        await expect(orderUcdItem).toHaveAttribute('aria-selected', 'true')
        void UUIDS
    })
})
