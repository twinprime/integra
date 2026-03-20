import { test, expect } from '@playwright/test'
import { loadAppWithFixture } from './helpers/app'
import { makeLocalStorageValueWithEmptySeq } from './fixtures/sample-system'
import { openEditableTreeItem, revealTreeItem, saveEditorByBlurring } from './helpers/interactions'

test.beforeEach(async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValueWithEmptySeq())
})

test.describe('auto-create missing path nodes', () => {
    test('typing a direct root component reference auto-creates the missing component in the tree', async ({
        page,
    }) => {
        const cmEditor = await openEditableTreeItem(page, 'New Flow')

        // Type a spec referencing a new direct child of the root component.
        await cmEditor.click()
        await cmEditor.type(
            ['actor User', 'component NewModule', 'User --> NewModule: hello'].join('\n')
        )

        // Save by clicking outside (blur)
        await saveEditorByBlurring(page)

        // Assert "NewModule" appears as a tree item.
        await expect(await revealTreeItem(page, 'NewModule')).toBeVisible()
    })

    test('typing an actor path reference auto-creates the actor under the target component', async ({
        page,
    }) => {
        const cmEditor = await openEditableTreeItem(page, 'New Flow')

        await cmEditor.click()
        await cmEditor.type(
            [
                'actor AuthService/AdminUser',
                'component AuthService',
                'AdminUser --> AuthService: hello',
            ].join('\n')
        )

        // Save by clicking outside (blur)
        await saveEditorByBlurring(page)

        // "AdminUser" actor should appear in the tree under AuthService
        await expect(await revealTreeItem(page, 'AdminUser')).toBeVisible()
    })
})
