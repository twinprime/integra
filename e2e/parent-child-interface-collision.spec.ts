import { test, expect, type Page, type Locator } from '@playwright/test'
import type { ComponentNode } from '../src/store/types'
import { loadAppWithFixture } from './helpers/app'
import {
    codeMirrorEditor,
    getVisibleCodeMirrorEditor,
    revealTreeItem,
    saveEditorByBlurring,
    selectTreeItem,
    treeItem,
} from './helpers/interactions'

function makeLocalStorageValueForParentChildInterfaceCollision(): string {
    const root: ComponentNode = {
        uuid: 'p-uuid',
        id: 'P',
        name: 'P',
        type: 'component',
        description: '',
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [
            {
                uuid: 'if1-uuid',
                id: 'IF1',
                name: 'IF1',
                type: 'rest',
                functions: [{ uuid: 'hello-fn-uuid', id: 'hello', parameters: [] }],
            },
        ],
    }

    return JSON.stringify({ state: { rootComponent: root }, version: 0 })
}

async function createNodeFromContextMenu(
    page: Page,
    targetText: string | RegExp,
    actionName: 'Add Sub-component' | 'Add Use Case Diagram' | 'Add Sequence Diagram',
    id: string,
    placeholder: string
): Promise<void> {
    await treeItem(page, targetText).click({ button: 'right' })
    await page.getByRole('button', { name: actionName }).click()
    await page.getByPlaceholder(placeholder).fill(id)
    await page.getByRole('button', { name: 'Create' }).click()
}

async function openDiagramEditor(page: Page, targetText: string | RegExp): Promise<Locator> {
    await selectTreeItem(page, targetText)

    const emptyState = page.getByRole('button', { name: 'Click to edit specification' })
    const preview = page.getByRole('button', { name: 'Diagram specification — click to edit' })
    let sawStableEditor = false

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const editor = codeMirrorEditor(page)
        const emptyVisible = await emptyState.isVisible().catch(() => false)
        const previewVisible = await preview.isVisible().catch(() => false)

        if (emptyVisible) {
            await emptyState.click()
            return getVisibleCodeMirrorEditor(page, 10000)
        }

        if (previewVisible) {
            await preview.click()
            return getVisibleCodeMirrorEditor(page, 10000)
        }

        const editorVisible = await editor.isVisible().catch(() => false)
        if (editorVisible) {
            if (sawStableEditor) return getVisibleCodeMirrorEditor(page, 10000)
            sawStableEditor = true
        } else {
            sawStableEditor = false
        }

        await page.waitForTimeout(100)
    }

    throw new Error(`Could not open the specification editor for ${String(targetText)}`)
}

test.describe('parent-child interface collision in sequence editor', () => {
    test.beforeEach(async ({ page }) => {
        await loadAppWithFixture(page, makeLocalStorageValueForParentChildInterfaceCollision())
    })

    test('allows C to create IF1:hello(name: string) without a conflict dialog when only P owns IF1', async ({
        page,
    }) => {
        await createNodeFromContextMenu(page, /^P$/, 'Add Sub-component', 'C', 'my_service')
        await expect(treeItem(page, /^C$/)).toBeVisible()

        await createNodeFromContextMenu(page, /^C$/, 'Add Use Case Diagram', 'main', 'my_feature')
        await expect(treeItem(page, /^Main$/)).toBeVisible()

        const useCaseEditor = await openDiagramEditor(page, /^Main$/)
        await useCaseEditor.type(['actor A', 'use case U', 'A ->> U'].join('\n'))
        await saveEditorByBlurring(page)

        await expect(await revealTreeItem(page, /^A$/)).toBeVisible()
        await expect(await revealTreeItem(page, /^U$/)).toBeVisible()

        await createNodeFromContextMenu(page, /^U$/, 'Add Sequence Diagram', 'seq', 'my_feature')
        await expect(treeItem(page, /^Seq$/)).toBeVisible()

        const sequenceEditor = await openDiagramEditor(page, /^Seq$/)
        await sequenceEditor.type(
            ['actor A', 'component C', 'A ->> C: IF1:hello(name: string)'].join('\n')
        )
        await sequenceEditor.press('Shift+Enter')

        await expect(page.getByText('Function Definition Conflict')).not.toBeVisible()

        await selectTreeItem(page, /^C$/)
        await expect(page.getByTestId('interface-tab-IF1')).toBeVisible()
    })
})
