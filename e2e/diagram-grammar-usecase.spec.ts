import { test, expect, type Locator, type Page } from '@playwright/test'
import { makeLocalStorageValue } from './fixtures/sample-system'

const diagramSelector = '[data-testid="diagram-svg-container"]'
const useCaseGrammarSpec = [
    'actor customer',
    'use case Login',
    'use case PlaceOrder',
    'component System/AuthService as authSvc',
    'component System/OrderService as orderSvc',
    'customer ->> Login: initiates',
    'customer --- PlaceOrder: explores',
    'authSvc --o PlaceOrder: supports',
    'orderSvc --x Login: blocks',
    'customer <--> authSvc: interacts with',
    'authSvc o--o orderSvc: syncs',
    'customer x--x orderSvc: conflicts',
    'authSvc -.-> Login: traces',
    'orderSvc -.- PlaceOrder: loosely linked',
    'customer ==> PlaceOrder: prioritizes',
    'authSvc === Login: owns',
    'orderSvc ~~~ Login: hidden dependency',
].join('\n')

async function loadFixture(page: Page, value: string): Promise<void> {
    await page.addInitScript((storageValue) => {
        localStorage.setItem('integra-system', storageValue)
    }, value)
    await page.goto('/')
}

async function openUseCaseEditor(page: Page): Promise<Locator> {
    await page.getByRole('treeitem').filter({ hasText: 'Main Use Cases' }).first().click()
    await page.getByLabel('Diagram specification — click to edit').click()
    const editor = page.locator('.cm-content[contenteditable="true"]')
    await expect(editor).toBeVisible()
    return editor
}

async function replaceSpec(page: Page, editor: Locator, spec: string): Promise<void> {
    await editor.click()
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${mod}+a`)
    await page.keyboard.press('Backspace')
    await page.keyboard.insertText(spec)
    await page.locator('body').click({ position: { x: 10, y: 10 } })
    await page.locator(`${diagramSelector} svg`).waitFor()
}

test.describe('use-case diagram grammar coverage', () => {
    test.beforeEach(async ({ page }) => {
        await loadFixture(page, makeLocalStorageValue())
    })

    test('renders documented use-case arrow variants and link labels', async ({ page }) => {
        const editor = await openUseCaseEditor(page)
        await replaceSpec(page, editor, useCaseGrammarSpec)

        const diagram = page.locator(diagramSelector)
        await expect(diagram).toContainText('initiates')
        await expect(diagram).toContainText('explores')
        await expect(diagram).toContainText('supports')
        await expect(diagram).toContainText('blocks')
        await expect(diagram).toContainText('interacts with')
        await expect(diagram).toContainText('syncs')
        await expect(diagram).toContainText('conflicts')
        await expect(diagram).toContainText('traces')
        await expect(diagram).toContainText('loosely linked')
        await expect(diagram).toContainText('prioritizes')
        await expect(diagram).toContainText('owns')
        await expect(diagram).toContainText('hidden dependency')
        await expect(diagram).toContainText('AuthService')
        await expect(diagram).toContainText('OrderService')
        await expect(diagram).toContainText('PlaceOrder')
    })

    test('navigates external component path references declared with aliases', async ({ page }) => {
        const editor = await openUseCaseEditor(page)
        await replaceSpec(page, editor, useCaseGrammarSpec)

        await page.locator(diagramSelector).getByText('AuthService').click()
        await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toContainText(
            'AuthService'
        )

        await page.getByRole('treeitem').filter({ hasText: 'Main Use Cases' }).first().click()
        await page.locator(`${diagramSelector} svg`).waitFor()

        await page.locator(diagramSelector).getByText('OrderService').click()
        await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toContainText(
            'OrderService'
        )
    })
})
