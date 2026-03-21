import { test, expect } from '@playwright/test'
import { selectTreeItem } from './helpers/interactions'
import { makeLocalStorageValue } from './fixtures/sample-system'
import { gotoHome } from './helpers/app'

test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
        localStorage.setItem('integra-system', value)
    }, lsValue)
    await gotoHome(page)
})

const backBtn = (page: import('@playwright/test').Page) => page.getByTitle('Go back (Alt+←)')
const forwardBtn = (page: import('@playwright/test').Page) => page.getByTitle('Go forward (Alt+→)')

test.describe('navigation history', () => {
    test('initial state: Back button is disabled when only one node visited', async ({ page }) => {
        await selectTreeItem(page, 'AuthService')
        await expect(backBtn(page)).toBeDisabled()
        await expect(forwardBtn(page)).toBeDisabled()
    })

    test('Back button: navigates to previous node', async ({ page }) => {
        // Navigate: System → AuthService → OrderService
        await selectTreeItem(page, /^System$/)
        await selectTreeItem(page, 'AuthService')
        await selectTreeItem(page, 'OrderService')

        // Verify Back is now enabled
        await expect(backBtn(page)).toBeEnabled()

        // Click Back → should land on AuthService
        await backBtn(page).click()
        await expect(
            page.getByRole('treeitem').filter({ hasText: 'AuthService' }).first()
        ).toHaveAttribute('aria-selected', 'true')
    })

    test('Forward button: navigates forward after going back', async ({ page }) => {
        // Navigate: AuthService → OrderService → Back → Forward
        await selectTreeItem(page, 'AuthService')
        await selectTreeItem(page, 'OrderService')

        await backBtn(page).click()
        await expect(
            page.getByRole('treeitem').filter({ hasText: 'AuthService' }).first()
        ).toHaveAttribute('aria-selected', 'true')

        await expect(forwardBtn(page)).toBeEnabled()
        await forwardBtn(page).click()
        await expect(
            page.getByRole('treeitem').filter({ hasText: 'OrderService' }).first()
        ).toHaveAttribute('aria-selected', 'true')
    })

    test('Alt+← shortcut: navigates back', async ({ page }) => {
        // Click two nodes; clicking in the tree marks it active for keyboard shortcuts
        await selectTreeItem(page, 'AuthService')
        await selectTreeItem(page, 'OrderService')

        // Press Alt+← to go back
        await page.keyboard.press('Alt+ArrowLeft')
        await expect(
            page.getByRole('treeitem').filter({ hasText: 'AuthService' }).first()
        ).toHaveAttribute('aria-selected', 'true')
    })

    test('Alt+→ shortcut: navigates forward after going back', async ({ page }) => {
        await selectTreeItem(page, 'AuthService')
        await selectTreeItem(page, 'OrderService')

        await page.keyboard.press('Alt+ArrowLeft')
        await expect(
            page.getByRole('treeitem').filter({ hasText: 'AuthService' }).first()
        ).toHaveAttribute('aria-selected', 'true')

        await page.keyboard.press('Alt+ArrowRight')
        await expect(
            page.getByRole('treeitem').filter({ hasText: 'OrderService' }).first()
        ).toHaveAttribute('aria-selected', 'true')
    })

    test('Forward stack resets after navigating to a new node', async ({ page }) => {
        // Navigate: AuthService → OrderService → Back (now at AuthService) → User
        await selectTreeItem(page, 'AuthService')
        await selectTreeItem(page, 'OrderService')

        await backBtn(page).click()
        await expect(
            page.getByRole('treeitem').filter({ hasText: 'AuthService' }).first()
        ).toHaveAttribute('aria-selected', 'true')

        // Navigate to a new node — forward stack should reset
        await selectTreeItem(page, /^User$/)
        await expect(forwardBtn(page)).toBeDisabled()
    })
})
