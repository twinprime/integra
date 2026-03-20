import { test, expect } from '@playwright/test'
import { loadAppWithFixture } from './helpers/app'
import { makeLocalStorageValueWithEmptySeq } from './fixtures/sample-system'
import { openEditableTreeItem } from './helpers/interactions'

test.beforeEach(async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValueWithEmptySeq())
})

test.describe('spec editor keyboard shortcuts', () => {
    test('Tab indents the current line by 2 spaces instead of changing focus', async ({ page }) => {
        const cmEditor = await openEditableTreeItem(page, 'New Flow')

        await cmEditor.click()

        // Type a first line then move to a new line
        await cmEditor.type('actor User')
        await cmEditor.press('Enter')

        // Press Tab — should indent the new line rather than move HTML focus
        await cmEditor.press('Tab')

        // Type a character so we can inspect the resulting line content
        await cmEditor.type('x')

        // The editor should still be focused (Tab did not move focus away)
        await expect(cmEditor).toBeFocused()

        // The second line should start with 2 spaces followed by the typed char
        const content = await cmEditor.textContent()
        expect(content).toContain('  x')
    })

    test('Shift+Enter saves the spec without leaving edit mode', async ({ page }) => {
        const cmEditor = await openEditableTreeItem(page, 'New Flow')

        await cmEditor.click()

        // Type a spec that references a new direct child of root so we can verify
        // the save by checking the tree (the node gets auto-created on save).
        await cmEditor.type(
            ['actor User', 'component SavedModule', 'User --> SavedModule: hello'].join('\n')
        )

        // Press Shift+Enter — should save content without exiting edit mode
        await cmEditor.press('Shift+Enter')
        await page.waitForTimeout(300)

        // The editor must still be in edit mode (contenteditable div still present)
        await expect(cmEditor).toBeVisible()

        // The save triggered auto-creation: "SavedModule" should now appear in the tree
        await expect(page.getByRole('treeitem').filter({ hasText: 'SavedModule' })).toBeVisible()
    })
})
