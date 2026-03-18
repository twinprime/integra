import { test, expect } from '@playwright/test'
import { makeLocalStorageValue } from './fixtures/sample-system'
import { loadAppWithFixture } from './helpers/app'
import {
    getVisibleCodeMirrorEditor,
    renameNodeId,
    renameSelectedNodeId,
    selectTreeItem,
    specificationEditor,
    treeItem,
} from './helpers/interactions'

test.beforeEach(async ({ page }) => {
    await loadAppWithFixture(page, makeLocalStorageValue())
})

test.describe('undo / redo', () => {
    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Rename the "Login" use-case ID to "SignIn" so there is one history entry. */
    async function renameLoginToSignIn(page: import('@playwright/test').Page) {
        await renameNodeId(page, 'Login', 'SignIn')
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    test('toolbar Undo button restores a renamed node', async ({ page }) => {
        await renameLoginToSignIn(page)

        // The rename propagates into the use-case diagram content
        await selectTreeItem(page, 'Main Use Cases')
        const diagramEditor = specificationEditor(page)
        await expect(diagramEditor).toContainText('use case SignIn')
        await expect(diagramEditor).not.toContainText('use case Login')

        // Click the Undo toolbar button
        await page.getByTitle('Undo (Cmd+Z)').click()

        // Diagram content should be back to the original
        await expect(diagramEditor).toContainText('use case Login')
        await expect(diagramEditor).not.toContainText('use case SignIn')
    })

    test('keyboard Ctrl+Z outside editor undoes a rename', async ({ page }) => {
        await renameLoginToSignIn(page)

        // Navigate away from the ID input by clicking a tree item so neither an
        // <input> nor a .cm-editor is focused (the keyboard handler early-exits for those)
        await selectTreeItem(page, 'Main Use Cases')
        const diagramEditor = specificationEditor(page)
        await expect(diagramEditor).toContainText('use case SignIn')

        // Click the tree panel body to ensure focus is outside any input/editor
        await treeItem(page, 'Main Use Cases').click()

        // Press Ctrl+Z on the page body
        await page.keyboard.press('Control+z')

        // The rename should be reverted
        await expect(diagramEditor).toContainText('use case Login')
        await expect(diagramEditor).not.toContainText('use case SignIn')
    })

    test('toolbar Redo button re-applies an undone change', async ({ page }) => {
        await renameLoginToSignIn(page)

        await selectTreeItem(page, 'Main Use Cases')
        const diagramEditor = specificationEditor(page)
        await expect(diagramEditor).toContainText('use case SignIn')

        // Undo the rename
        await page.getByTitle('Undo (Cmd+Z)').click()
        await expect(diagramEditor).toContainText('use case Login')

        // Redo restores it
        await page.getByTitle('Redo (Cmd+Shift+Z)').click()
        await expect(diagramEditor).toContainText('use case SignIn')
        await expect(diagramEditor).not.toContainText('use case Login')
    })

    test('multiple undo steps restore changes in reverse order', async ({ page }) => {
        // Change 1: rename "Login" use-case ID → "SignIn"
        await renameLoginToSignIn(page)

        // Change 2: rename the root-scoped "User" actor ID → "Customer".
        // The fixture also contains an OrderService-local "User" actor that should
        // remain untouched.
        await page
            .getByRole('treeitem')
            .filter({ hasText: /^User$/ })
            .last()
            .click()
        await renameSelectedNodeId(page, 'Customer')

        // Both changes are visible in the use-case diagram
        await selectTreeItem(page, 'Main Use Cases')
        const diagramEditor = specificationEditor(page)
        await expect(diagramEditor).toContainText('actor Customer')
        await expect(diagramEditor).toContainText('use case SignIn')

        // First undo reverts the actor rename (most recent change)
        await page.getByTitle('Undo (Cmd+Z)').click()
        await expect(diagramEditor).toContainText('actor User')
        await expect(diagramEditor).toContainText('use case SignIn')

        // Second undo reverts the use-case rename
        await page.getByTitle('Undo (Cmd+Z)').click()
        await expect(diagramEditor).toContainText('actor User')
        await expect(diagramEditor).toContainText('use case Login')
    })

    test('Undo button is disabled initially and enabled after a change', async ({ page }) => {
        const undoBtn = page.getByTitle('Undo (Cmd+Z)')
        const redoBtn = page.getByTitle('Redo (Cmd+Shift+Z)')

        // Initially both are disabled (no history)
        await expect(undoBtn).toBeDisabled()
        await expect(redoBtn).toBeDisabled()

        // Make a change
        await renameLoginToSignIn(page)

        // Undo is now enabled; Redo is still disabled (nothing to redo)
        await expect(undoBtn).toBeEnabled()
        await expect(redoBtn).toBeDisabled()

        // Undo the change
        await undoBtn.click()

        // After undoing: Undo is disabled (back to clean state), Redo is enabled
        await expect(undoBtn).toBeDisabled()
        await expect(redoBtn).toBeEnabled()
    })

    test('undo removes a newly added sub-component from the tree', async ({ page }) => {
        // Right-click "AuthService" to open the context menu
        await selectTreeItem(page, 'AuthService')
        await treeItem(page, 'AuthService').dispatchEvent('contextmenu')

        // Click "Add Sub-component"
        await page.getByRole('button', { name: 'Add Sub-component' }).click()

        // Fill in the create dialog
        await page.getByPlaceholder('my_service').fill('TestComp')
        await page.getByRole('button', { name: 'Create' }).click()

        // The new node appears in the tree
        await expect(page.getByRole('treeitem').filter({ hasText: 'TestComp' })).toBeVisible()

        // Undo removes it
        await page.getByTitle('Undo (Cmd+Z)').click()
        await expect(page.getByRole('treeitem').filter({ hasText: 'TestComp' })).not.toBeVisible()
    })

    test('Ctrl+Z inside CodeMirror only undoes editor text, not tree operations', async ({
        page,
    }) => {
        // Create one tree history entry by renaming "Login" to "SignIn"
        await renameLoginToSignIn(page)

        // Navigate to "Login Flow" sequence diagram (has content → starts in preview mode)
        await selectTreeItem(page, 'Login Flow')

        // Click the preview to enter edit mode
        await page.getByLabel('Diagram specification — click to edit').click()

        // The CodeMirror editable editor should now be active
        const cmEditor = await getVisibleCodeMirrorEditor(page)
        await cmEditor.click()

        // Type a new line at the current cursor position.
        // Note: do NOT use Control+End to navigate — it is macOS-incompatible (macOS uses
        // Cmd+Down). The cursor position doesn't matter for the assertions below.
        await page.keyboard.type('\n# added by test')

        // Verify the extra text is present in the editor
        await expect(cmEditor).toContainText('added by test')

        // Undo using the platform-appropriate modifier.
        // CodeMirror binds undo to Mod-z (Cmd+Z on macOS, Ctrl+Z on Windows/Linux).
        const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
        await page.keyboard.press(`${mod}+z`)

        // The typed text should be gone (CodeMirror's own undo)
        await expect(cmEditor).not.toContainText('added by test')

        // Navigate to "Main Use Cases" and verify the tree-level rename was NOT undone
        await selectTreeItem(page, 'Main Use Cases')
        const diagramEditor = specificationEditor(page)
        await expect(diagramEditor).toContainText('use case SignIn')
        await expect(diagramEditor).not.toContainText('use case Login')
    })
})
