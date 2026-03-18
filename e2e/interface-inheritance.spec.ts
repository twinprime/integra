import { test, expect } from '@playwright/test'
import { makeLocalStorageValueWithInheritance } from './fixtures/sample-system'

test.beforeEach(async ({ page }) => {
    await page.addInitScript((value) => {
        localStorage.setItem('integra-system', value)
    }, makeLocalStorageValueWithInheritance())
    await page.goto('/')
})

test.describe('interface inheritance — warning icons on parent component', () => {
    test.beforeEach(async ({ page }) => {
        await page.getByRole('treeitem').filter({ hasText: 'System' }).first().click()
        await expect(page.getByTestId('interface-tab-IRootService')).toBeVisible()
    })

    test('interface inherited by a sub-component has no warning icon', async ({ page }) => {
        await expect(page.getByTestId('interface-tab-warning-IRootService')).not.toBeVisible()
    })

    test('interface not inherited by any sub-component shows a warning icon', async ({ page }) => {
        await expect(page.getByTestId('interface-tab-warning-IUnimplemented')).toBeVisible()
    })

    test('warning icon tooltip explains the reason', async ({ page }) => {
        const warning = page.getByTestId('interface-tab-warning-IUnimplemented')
        await expect(warning).toHaveAttribute('title', 'No sub-component inherits this interface')
    })
})

test.describe('interface inheritance — inherited interface display on sub-component', () => {
    test.beforeEach(async ({ page }) => {
        await page.getByRole('treeitem').filter({ hasText: 'AuthService' }).click()
        await expect(page.getByTestId('interface-tab-IAuthDerived')).toBeVisible()
        await page.getByTestId('interface-tab-IAuthDerived').click()
    })

    test("inherited interface panel shows 'inherited from' badge", async ({ page }) => {
        await expect(page.getByTestId('interface-tab-panel')).toContainText('inherited from')
    })

    test('inherited functions are displayed in the interface panel', async ({ page }) => {
        await expect(page.getByTestId('interface-tab-panel')).toContainText('doThing')
    })

    test('inherited functions have no editable ID input', async ({ page }) => {
        const panel = page.getByTestId('interface-tab-panel')
        await expect(panel.getByLabel('Function ID')).not.toBeVisible()
        await expect(panel.locator('span').filter({ hasText: 'doThing' })).toBeVisible()
    })

    test('inherited functions have no delete button', async ({ page }) => {
        await expect(page.getByTestId('fn-delete-btn')).not.toBeVisible()
    })

    test('inherited interface has a delete button to remove the inheritance', async ({ page }) => {
        await expect(page.getByTestId('delete-interface-btn')).toBeVisible()
    })
})

test.describe('interface inheritance — component-level inherit selector', () => {
    test('AuthService shows inherit-parent-select with only un-inherited parent interfaces', async ({
        page,
    }) => {
        await page.getByRole('treeitem').filter({ hasText: 'AuthService' }).click()
        const select = page.getByTestId('inherit-parent-select')
        await expect(select).toBeVisible()
        // IRootService is already inherited; only IUnimplemented should be listed
        const options = select.locator('option')
        await expect(options).toHaveCount(2) // disabled "— select —" + IUnimplemented
        await expect(options.nth(1)).toHaveText('IUnimplemented')
    })

    test('selecting a parent interface from inherit-parent-select creates a new tab', async ({
        page,
    }) => {
        await page.getByRole('treeitem').filter({ hasText: 'AuthService' }).click()
        const select = page.getByTestId('inherit-parent-select')
        await select.selectOption({ label: 'IUnimplemented' })
        // A new tab for IUnimplemented should appear
        await expect(page.getByTestId('interface-tab-IUnimplemented')).toBeVisible()
    })

    test('root component has no inherit-parent-select (no parent component)', async ({ page }) => {
        await page.getByRole('treeitem').filter({ hasText: 'System' }).first().click()
        await expect(page.getByTestId('inherit-parent-select')).not.toBeVisible()
    })
})
