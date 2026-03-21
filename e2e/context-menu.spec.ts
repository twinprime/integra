import { test, expect } from '@playwright/test'
import { makeLocalStorageValue } from './fixtures/sample-system'
import { revealTreeItem, selectTreeItem } from './helpers/interactions'
import { gotoHome } from './helpers/app'

test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
        localStorage.setItem('integra-system', value)
    }, lsValue)
    await gotoHome(page)
})

test.describe('context menu', () => {
    test('opens on right-click of a component node', async ({ page }) => {
        await page
            .getByRole('treeitem')
            .filter({ hasText: /^System$/ })
            .first()
            .click({ button: 'right' })

        await expect(page.getByRole('button', { name: 'Add Sub-component' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Add Use Case Diagram' })).toBeVisible()
    })

    test('dismisses when clicking outside', async ({ page }) => {
        await page
            .getByRole('treeitem')
            .filter({ hasText: /^System$/ })
            .first()
            .click({ button: 'right' })

        await expect(page.getByRole('button', { name: 'Add Sub-component' })).toBeVisible()

        // Click in the main content area, away from the context menu
        await page.mouse.click(700, 400)

        await expect(page.getByRole('button', { name: 'Add Sub-component' })).not.toBeVisible()
    })

    test('dismisses on Escape key press', async ({ page }) => {
        await page
            .getByRole('treeitem')
            .filter({ hasText: /^System$/ })
            .first()
            .click({ button: 'right' })

        await expect(page.getByRole('button', { name: 'Add Sub-component' })).toBeVisible()

        await page.keyboard.press('Escape')

        await expect(page.getByRole('button', { name: 'Add Sub-component' })).not.toBeVisible()
    })

    test('clicking Add Sub-component opens CreateNodeDialog', async ({ page }) => {
        await page
            .getByRole('treeitem')
            .filter({ hasText: 'AuthService' })
            .first()
            .click({ button: 'right' })

        await page.getByRole('button', { name: 'Add Sub-component' }).click()

        // CreateNodeDialog should appear with the correct heading
        await expect(page.getByRole('heading', { name: 'Add Sub-component' })).toBeVisible()

        // ID input should be auto-focused
        const idInput = page.getByLabel('ID')
        await expect(idInput).toBeFocused()

        // Cancel to clean up
        await page.getByRole('button', { name: 'Cancel' }).click()
        await expect(page.getByRole('heading', { name: 'Add Sub-component' })).not.toBeVisible()
    })

    test('shows correct menu items per node type', async ({ page }) => {
        // Component node: "Add Sub-component" + "Add Use Case Diagram", no "Add Sequence Diagram"
        await page
            .getByRole('treeitem')
            .filter({ hasText: /^System$/ })
            .first()
            .click({ button: 'right' })

        await expect(page.getByRole('button', { name: 'Add Sub-component' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Add Use Case Diagram' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Add Sequence Diagram' })).not.toBeVisible()

        await page.keyboard.press('Escape')

        // Use-case node: only "Add Sequence Diagram"
        await (await revealTreeItem(page, /^Login$/)).click({ button: 'right' })

        await expect(page.getByRole('button', { name: 'Add Sequence Diagram' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Add Sub-component' })).not.toBeVisible()
        await expect(page.getByRole('button', { name: 'Add Use Case Diagram' })).not.toBeVisible()

        await page.keyboard.press('Escape')

        // Actor node: right-click produces no context menu (computeMenuItems returns [])
        await selectTreeItem(page, /^System$/)
        await (await revealTreeItem(page, /^User$/)).click({ button: 'right' })

        await expect(page.getByRole('button', { name: 'Add Sub-component' })).not.toBeVisible()
        await expect(page.getByRole('button', { name: 'Add Sequence Diagram' })).not.toBeVisible()
    })
})
