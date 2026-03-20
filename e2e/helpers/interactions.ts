import { expect, type Locator, type Page } from '@playwright/test'

type TreeItemText = string | RegExp

export function treeItem(page: Page, hasText: TreeItemText): Locator {
    return page.getByRole('treeitem').filter({ hasText }).first()
}

export async function revealTreeItem(page: Page, hasText: TreeItemText): Promise<Locator> {
    const item = treeItem(page, hasText)
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await item.isVisible().catch(() => false)) return item
        const expandedCount = await page.locator('[aria-label="Expand"]').evaluateAll((buttons) => {
            const visibleButtons = buttons.filter(
                (button) =>
                    button instanceof HTMLElement &&
                    button.getAttribute('aria-label') === 'Expand' &&
                    button.offsetParent !== null
            )
            for (const button of visibleButtons) {
                ;(button as HTMLButtonElement).click()
            }
            return visibleButtons.length
        })
        if (expandedCount === 0) break
        await page.waitForTimeout(25)
    }
    await expect(item).toBeVisible()
    return item
}

export async function selectTreeItem(page: Page, hasText: TreeItemText): Promise<Locator> {
    const item = await revealTreeItem(page, hasText)
    await item.click()
    return item
}

export async function openEditableTreeItem(page: Page, hasText: TreeItemText): Promise<Locator> {
    await selectTreeItem(page, hasText)
    return getVisibleCodeMirrorEditor(page)
}

export function nodeIdInput(page: Page): Locator {
    return page.getByLabel('Node ID')
}

export function nodePath(page: Page): Locator {
    return page.getByTestId('node-path')
}

export function specificationEditor(page: Page): Locator {
    return page.getByLabel('Specification')
}

export function codeMirrorEditor(page: Page): Locator {
    return page.getByTestId('cm-editor-container').locator(".cm-content[contenteditable='true']")
}

export async function getVisibleCodeMirrorEditor(page: Page, timeout = 10000): Promise<Locator> {
    const editor = codeMirrorEditor(page)
    await expect(editor).toBeVisible({ timeout })
    return editor
}

export async function renameNodeId(
    page: Page,
    hasText: TreeItemText,
    nextId: string
): Promise<Locator> {
    const item = await selectTreeItem(page, hasText)
    const input = nodeIdInput(page)
    const currentId = typeof hasText === 'string' ? hasText : (await item.textContent())?.trim()
    if (currentId) {
        await expect(input).toHaveValue(currentId)
    }
    return renameSelectedNodeId(page, nextId)
}

export async function renameSelectedNodeId(page: Page, nextId: string): Promise<Locator> {
    const input = nodeIdInput(page)
    const persistedBefore = await page.evaluate(() => localStorage.getItem('integra-system'))
    await input.clear()
    await input.fill(nextId)
    await input.press('Enter')
    await expect(input).not.toBeFocused()
    await page.waitForFunction(
        (previousSnapshot) => localStorage.getItem('integra-system') !== previousSnapshot,
        persistedBefore
    )
    return input
}

export async function saveEditorByBlurring(page: Page): Promise<void> {
    const blurTarget = page.getByLabel('Node ID')
    if (await blurTarget.isVisible()) {
        await blurTarget.click()
    } else {
        await page.locator('body').click({ position: { x: 10, y: 10 } })
    }
    await page.waitForTimeout(200)
}

export async function replaceCodeMirrorContent(
    page: Page,
    editor: Locator,
    content: string
): Promise<void> {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await editor.click()
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.press('Backspace')
    await page.keyboard.insertText(content)
}
