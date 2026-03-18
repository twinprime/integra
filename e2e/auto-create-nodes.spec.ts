import { test, expect } from '@playwright/test'
import { loadAppWithFixture } from './helpers/app'
import { makeLocalStorageValueWithEmptySeq } from './fixtures/sample-system'
import { openEditableTreeItem, saveEditorByBlurring } from './helpers/interactions'

test.beforeEach(async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValueWithEmptySeq())
})

test.describe('auto-create missing path nodes', () => {
    test('typing a component path reference auto-creates the missing component in the tree', async ({
        page,
    }) => {
        const cmEditor = await openEditableTreeItem(page, 'New Flow')

        // Type a spec referencing a new sub-component under AuthService that doesn't yet exist
        await cmEditor.click()
        await cmEditor.type(
            [
                'actor User',
                'component AuthService',
                'component AuthService/NewModule',
                'User --> AuthService: hello',
            ].join('\n')
        )

        // Save by clicking outside (blur)
        await saveEditorByBlurring(page)

        // Assert "NewModule" appears as a tree item (auto-created under AuthService)
        await expect(page.getByRole('treeitem').filter({ hasText: 'NewModule' })).toBeVisible()
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
        await expect(page.getByRole('treeitem').filter({ hasText: 'AdminUser' })).toBeVisible()
    })
})
