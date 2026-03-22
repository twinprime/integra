import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { makeLocalStorageValueForFunctionUpdate } from './fixtures/sample-system'
import { loadAppWithFixture } from './helpers/app'
import { openEditableTreeItem } from './helpers/interactions'

/**
 * Helper: navigate to the "Auth Flow" sequence diagram and confirm the editor is open.
 * Auth Flow has no pre-existing content, so DiagramEditor opens it directly in edit mode.
 */
async function openAuthFlowEditor(page: Page) {
    const editor = await openEditableTreeItem(page, 'Auth Flow')
    return editor
}

/**
 * Helper: type an incompatible signature change (same param count, different type) and save.
 * This triggers an "incompatible" FunctionMatch → FunctionUpdateDialog appears.
 */
async function triggerIncompatibleConflict(page: Page) {
    const editor = await openAuthFlowEditor(page)
    await editor.click()
    await editor.type(
        ['actor User', 'component AuthAPI', 'User ->> AuthAPI: ILogin:login(userId: number)'].join(
            '\n'
        )
    )
    await editor.press('Shift+Enter')
}

/**
 * Helper: type a signature change that grows the parameter list and save.
 * Function IDs are unique per interface, so this still updates the existing function.
 */
async function triggerSignatureGrowthConflict(page: Page) {
    const editor = await openAuthFlowEditor(page)
    await editor.click()
    await editor.type(
        [
            'actor User',
            'component AuthAPI',
            'User ->> AuthAPI: ILogin:login(userId: string, token: string)',
        ].join('\n')
    )
    await editor.press('Shift+Enter')
}

test.beforeEach(async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValueForFunctionUpdate())
})

test.describe('FunctionUpdateDialog', () => {
    test('incompatible signature changes prompt for updating affected diagrams', async ({
        page,
    }) => {
        await triggerIncompatibleConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
        await expect(page.getByRole('listitem').filter({ hasText: 'Backup Flow' })).toBeVisible()
        await page.getByRole('button', { name: 'Apply' }).click()
        await expect(page.getByText('Function Definition Conflict')).not.toBeVisible()
    })

    test('signature changes with additional parameters still update the existing function', async ({
        page,
    }) => {
        await triggerSignatureGrowthConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
        await expect(page.getByRole('listitem').filter({ hasText: 'Backup Flow' })).toBeVisible()
        await page.getByRole('button', { name: 'Apply' }).click()
        await expect(page.getByText('Function Definition Conflict')).not.toBeVisible()
    })
})
