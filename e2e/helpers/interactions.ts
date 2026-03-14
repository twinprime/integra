import { expect, type Locator, type Page } from "@playwright/test"

type TreeItemText = string | RegExp

export function treeItem(page: Page, hasText: TreeItemText): Locator {
  return page.getByRole("treeitem").filter({ hasText }).first()
}

export async function selectTreeItem(page: Page, hasText: TreeItemText): Promise<Locator> {
  const item = treeItem(page, hasText)
  await item.click()
  return item
}

export async function openEditableTreeItem(
  page: Page,
  hasText: TreeItemText,
): Promise<Locator> {
  await selectTreeItem(page, hasText)
  return getVisibleCodeMirrorEditor(page)
}

export function nodeIdInput(page: Page): Locator {
  return page.getByLabel("Node ID")
}

export function specificationEditor(page: Page): Locator {
  return page.getByLabel("Specification")
}

export function codeMirrorEditor(page: Page): Locator {
  return page.locator(".cm-content[contenteditable='true']")
}

export async function getVisibleCodeMirrorEditor(page: Page): Promise<Locator> {
  const editor = codeMirrorEditor(page)
  await expect(editor).toBeVisible()
  return editor
}

export async function renameNodeId(
  page: Page,
  hasText: TreeItemText,
  nextId: string,
): Promise<Locator> {
  await selectTreeItem(page, hasText)
  const input = nodeIdInput(page)
  await input.clear()
  await input.fill(nextId)
  await input.press("Enter")
  return input
}

export async function saveEditorByBlurring(page: Page): Promise<void> {
  await page.locator("body").click({ position: { x: 10, y: 10 } })
  await page.waitForTimeout(300)
}
