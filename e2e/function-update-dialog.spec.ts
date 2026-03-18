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
    test('dialog appears when an incompatible signature change is saved', async ({ page }) => {
        await triggerIncompatibleConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
    })

    test('dialog lists affected diagrams for an incompatible conflict', async ({ page }) => {
        await triggerIncompatibleConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
        // "Backup Flow" references the same login function → it must appear as affected
        await expect(page.getByRole('listitem').filter({ hasText: 'Backup Flow' })).toBeVisible()
    })

    test('apply button resolves the conflict and closes the dialog', async ({ page }) => {
        await triggerIncompatibleConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
        await page.getByRole('button', { name: 'Apply' }).click()

        await expect(page.getByText('Function Definition Conflict')).not.toBeVisible()
    })

    test('cancel button closes the dialog without saving', async ({ page }) => {
        await triggerIncompatibleConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
        await page.getByRole('button', { name: 'Cancel' }).click()

        await expect(page.getByText('Function Definition Conflict')).not.toBeVisible()
    })

    test('compatible signature change shows add-overload radio options', async ({ page }) => {
        await triggerCompatibleConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
        // Compatible conflicts present a choice between adding a new overload or updating existing
        await expect(page.getByLabel('Add new definition')).toBeVisible()
        await expect(page.getByLabel('Update existing')).toBeVisible()
    })

    test('selecting update-existing for a compatible conflict reveals the affected diagrams list', async ({
        page,
    }) => {
        await triggerCompatibleConflict(page)

        await expect(page.getByText('Function Definition Conflict')).toBeVisible()
        // Default is "Add new definition"; switch to "Update existing" to see affected diagrams
        await page.getByLabel('Update existing').click()

        // Backup Flow references the login function, so it should appear in the affected list
        await expect(page.getByRole('listitem').filter({ hasText: 'Backup Flow' })).toBeVisible()
    })
})
