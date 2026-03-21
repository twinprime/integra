import { test, expect } from '@playwright/test'

test.describe('browse mode', () => {
    test('defaults to browse mode and persists the mode toggle', async ({ page }) => {
        await page.goto('/')

        await expect(page.getByLabel('Switch to edit mode')).toBeVisible()
        await expect(page.getByTitle('Undo (Cmd+Z)')).not.toBeVisible()

        await page.getByLabel('Switch to edit mode').click()

        await expect(page.getByLabel('Switch to browse mode')).toBeVisible()
        await expect(page.getByTitle('Undo (Cmd+Z)')).toBeVisible()

        await page.reload()

        await expect(page.getByLabel('Switch to browse mode')).toBeVisible()
        await expect(page.getByTitle('Undo (Cmd+Z)')).toBeVisible()
    })
})
