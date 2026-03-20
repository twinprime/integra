/**
 * Reproduces the bug: when a node's ID is renamed, diagrams that reference
 * that node via UseCase: or Sequence: path syntax break with a parse error
 * because the diagram content text is not updated.
 */
import { test, expect } from '@playwright/test'
import { makeLocalStorageValue, makeLocalStorageValueWithSeqRef } from './fixtures/sample-system'
import { selectTreeItem } from './helpers/interactions'

test.describe('renaming a node updates UseCase: and Sequence: refs in diagram content', () => {
    test('renaming a use-case node updates UseCase: path in referencing sequence diagram', async ({
        page,
    }) => {
        await page.addInitScript((value) => {
            localStorage.setItem('integra-system', value)
        }, makeLocalStorageValue())
        await page.goto('/')

        // The LoginFlow seq diagram has: User ->> OrderService: UseCase:OrderService/PlaceOrder:Place an order
        // Rename PlaceOrder -> CheckOut
        await selectTreeItem(page, /^Place Order$/)
        const idInput = page.getByLabel('Node ID')
        await expect(idInput).toHaveValue('PlaceOrder')
        await idInput.clear()
        await idInput.fill('CheckOut')
        await idInput.press('Enter')

        // Navigate to Login Flow sequence diagram
        await selectTreeItem(page, 'Login Flow')
        const specEditor = page.getByLabel('Specification')
        // The UseCase: path should be updated
        await expect(specEditor).toContainText('UseCase:OrderService/CheckOut')
        await expect(specEditor).not.toContainText('UseCase:OrderService/PlaceOrder')
        // The diagram should NOT show a parse error
        await expect(page.locator(".parse-error, [data-testid='parse-error']")).not.toBeVisible()
    })

    test('renaming a sequence diagram node updates Sequence: path in referencing diagram', async ({
        page,
    }) => {
        await page.addInitScript((value) => {
            localStorage.setItem('integra-system', value)
        }, makeLocalStorageValueWithSeqRef())
        await page.goto('/')

        // Main Flow diagram has: User ->> AuthService: Sequence:LoginFlow
        // Rename LoginFlow -> AuthFlow
        await selectTreeItem(page, 'Login Flow')
        const idInput = page.getByLabel('Node ID')
        await expect(idInput).toHaveValue('LoginFlow')
        await idInput.clear()
        await idInput.fill('AuthFlow')
        await idInput.press('Enter')

        // Navigate to Main Flow (the diagram that references LoginFlow)
        await selectTreeItem(page, 'Main Flow')
        const specEditor = page.getByLabel('Specification')
        // The Sequence: path should be updated
        await expect(specEditor).toContainText('Sequence:AuthFlow')
        await expect(specEditor).not.toContainText('Sequence:LoginFlow')
        // The diagram should NOT show a parse error
        await expect(page.locator(".parse-error, [data-testid='parse-error']")).not.toBeVisible()
    })
})
