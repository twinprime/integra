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
 * Helper: type a compatible signature change (different param count) and save.
 * This triggers a "compatible" FunctionMatch → FunctionUpdateDialog shows radio buttons.
 */
async function triggerCompatibleConflict(page: Page) {
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

    test('compatible signature changes let the user choose whether to update referenced diagrams', async ({
        page,
    }) => {
        await triggerCompatibleConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
        await expect(page.getByLabel('Add new definition')).toBeVisible()
        await expect(page.getByLabel('Update existing')).toBeVisible()
        await page.getByLabel('Update existing').click()
        await expect(page.getByRole('listitem').filter({ hasText: 'Backup Flow' })).toBeVisible()
    })
})
