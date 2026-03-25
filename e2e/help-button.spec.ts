import { expect, test } from '@playwright/test'

test.describe('help button', () => {
    test('opens the developer guide in a new tab', async ({ page }) => {
        await page.goto('/')

        const popupPromise = page.waitForEvent('popup')
        await page.getByTitle('Help').click()

        const popup = await popupPromise
        await popup.waitForLoadState('domcontentloaded')

        await expect(popup).toHaveURL(/view=developer-guide/)
        await expect(
            popup.getByRole('heading', { name: 'Developer Guide', exact: true })
        ).toBeVisible()
        await expect(popup.getByText('Model Invariants')).toBeVisible()
    })
})
