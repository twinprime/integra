import { expect, test } from '@playwright/test'

test.describe('help button', () => {
    test('opens the user guide in a new tab', async ({ page }) => {
        await page.goto('/')

        const popupPromise = page.waitForEvent('popup')
        await page.getByTitle('Help').click()

        const popup = await popupPromise
        await popup.waitForLoadState('domcontentloaded')

        await expect(popup).toHaveURL(/view=user-guide/)
        await expect(
            popup.getByRole('heading', { name: 'Integra User Guide', exact: true })
        ).toBeVisible()
        await expect(popup.getByText('Quick Start')).toBeVisible()
    })
})
