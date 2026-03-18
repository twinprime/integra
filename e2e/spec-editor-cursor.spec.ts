import { test, expect } from '@playwright/test'
import { makeLocalStorageValue } from './fixtures/sample-system'

test.describe('spec editor cursor behaviour', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript((value) => {
            localStorage.setItem('integra-system', value)
        }, makeLocalStorageValue())
        await page.goto('/')
        // Open a sequence diagram — editor starts in preview (readonly) mode
        await page.getByRole('treeitem').filter({ hasText: 'Login Flow' }).first().click()
        await page.locator('[data-testid="cm-editor-container"]').waitFor()
    })

    test('cursor is pointer on navigable tokens in preview mode', async ({ page }) => {
        const token = page.locator('.cm-integra-fn').first()
        const cursor = await token.evaluate((el) => {
            // @ts-expect-error getComputedStyle is a browser global not typed under lib:ES2023
            return getComputedStyle(el).cursor as string
        })
        expect(cursor).toBe('pointer')
    })

    test('cursor is not pointer on navigable tokens in edit mode', async ({ page }) => {
        // Click the preview editor to enter edit mode
        await page.locator('[aria-label="Diagram specification — click to edit"]').click()
        // Wait for the edit-mode editor to be active (contenteditable)
        await page.locator('.cm-content[contenteditable="true"]').waitFor()

        const token = page.locator('.cm-integra-fn').first()
        const cursor = await token.evaluate((el) => {
            // @ts-expect-error getComputedStyle is a browser global not typed under lib:ES2023
            return getComputedStyle(el).cursor as string
        })
        expect(cursor).not.toBe('pointer')
    })
})
