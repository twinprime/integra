import { test, expect } from '@playwright/test'
import { makeLocalStorageValueWithInheritance } from './fixtures/sample-system'
import { selectTreeItem } from './helpers/interactions'

test.beforeEach(async ({ page }) => {
    await page.addInitScript((value) => {
        localStorage.setItem('integra-system', value)
    }, makeLocalStorageValueWithInheritance())
    await page.goto('/')
})

test.describe('interface inheritance', () => {
    test('shows warning state only for parent interfaces with no inheriting child', async ({
        page,
    }) => {
        await selectTreeItem(page, 'System')
        await expect(page.getByTestId('interface-tab-IRootService')).toBeVisible()
        await expect(page.getByTestId('interface-tab-warning-IRootService')).not.toBeVisible()
        await expect(page.getByTestId('interface-tab-warning-IUnimplemented')).toBeVisible()
        const warning = page.getByTestId('interface-tab-warning-IUnimplemented')
        await expect(warning).toHaveAttribute('title', 'No sub-component inherits this interface')
    })

    test('lets a child component inherit an available parent interface', async ({ page }) => {
        await selectTreeItem(page, 'AuthService')
        const select = page.getByTestId('inherit-parent-select')
        await expect(select).toBeVisible()
        const options = select.locator('option')
        await expect(options).toHaveCount(2)
        await expect(options.nth(1)).toHaveText('IUnimplemented')
        await select.selectOption({ label: 'IUnimplemented' })
        await expect(page.getByTestId('interface-tab-IUnimplemented')).toBeVisible()
    })
})
