import { expect, test, type Locator, type Page } from "@playwright/test"
import { makeMarkdownLayoutStorageValue } from "./fixtures/markdown-layout-system"
import { loadAppWithFixture } from "./helpers/app"
import { saveEditorByBlurring, selectTreeItem, treeItem } from "./helpers/interactions"

function markdownEditor(page: Page): Locator {
  return page.locator(".w-md-editor").first()
}

function markdownTextarea(page: Page): Locator {
  return markdownEditor(page).locator("textarea.w-md-editor-text-input")
}

function markdownPreview(page: Page): Locator {
  return markdownEditor(page).locator(".w-md-editor-preview")
}

test.describe("markdown descriptions", () => {
  test.beforeEach(async ({ page }) => {
    await loadAppWithFixture(page, makeMarkdownLayoutStorageValue())
  })

  test("edits description markdown and keeps the rendered preview in sync", async ({ page }) => {
    await selectTreeItem(page, /^User$/)

    const editor = markdownEditor(page)
    const textarea = markdownTextarea(page)
    const preview = markdownPreview(page)

    await editor.getByTitle("Live code (ctrl + 8)").click()
    await expect(textarea).toBeVisible()

    const updatedDescription = [
      "Updated **actor guide**",
      "",
      "- Preview updates live",
      "- Links stay clickable",
    ].join("\n")

    await textarea.fill(updatedDescription)

    await expect(preview.getByText("Updated actor guide")).toBeVisible()
    await expect(preview.locator("strong")).toContainText("actor guide")
    await expect(preview.getByRole("listitem").filter({ hasText: "Preview updates live" })).toBeVisible()
    await expect(preview.getByRole("listitem").filter({ hasText: "Links stay clickable" })).toBeVisible()

    await saveEditorByBlurring(page)

    await selectTreeItem(page, "OrderService")
    await selectTreeItem(page, /^User$/)

    await expect(markdownPreview(page).locator("strong")).toContainText("actor guide")
    await markdownEditor(page).getByTitle("Live code (ctrl + 8)").click()
    await expect(markdownTextarea(page)).toHaveValue(updatedDescription)
  })

  test("navigates the tree from internal markdown node-path links", async ({ page }) => {
    await selectTreeItem(page, /^User$/)

    const preview = markdownPreview(page)

    await preview.getByRole("link", { name: "OrderService" }).click()
    await expect(treeItem(page, "OrderService")).toHaveAttribute("aria-selected", "true")

    await selectTreeItem(page, /^User$/)

    await preview.getByRole("link", { name: "Login Flow" }).click()
    await expect(treeItem(page, "Login Flow")).toHaveAttribute("aria-selected", "true")
  })
})
