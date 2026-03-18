import { test, expect, type Locator, type Page } from '@playwright/test'
import { makeLocalStorageValueWithEmptySeq } from './fixtures/sample-system'

const diagramSelector = '[data-testid="diagram-svg-container"]'
const sequenceGrammarSpec = [
    'actor End User',
    'actor Output Topics',
    'component System',
    'component AuthService',
    'component BillingService',
    'component System/OrderService as orders',
    'End User ->> AuthService: AuthFlowAPI:login(user: string, rememberMe: boolean?):Log in',
    'AuthService -->> End User: login accepted',
    'AuthService -> Output Topics: publish started',
    'Output Topics --> End User: status pending',
    'End User -x BillingService: cancel flow',
    'BillingService --x End User: cancellation noticed',
    'End User -) orders: enqueue async',
    'orders --) End User: queued',
    'note left of End User: entering credentials',
    'note right of AuthService: validates session',
    'note over AuthService, orders: shared processing state',
    'loop retry with backoff',
    '  End User ->> AuthService: AuthFlowAPI:retryLogin(attempt: number)',
    'end',
    'alt approved',
    '  AuthService ->> orders: OrdersAPI:placeOrder(orderId: string, amount: number?):Place order',
    'else rejected',
    '  AuthService -> End User: show error',
    'else',
    '  AuthService --> Output Topics: fallback event',
    'end',
    'opt remember me enabled',
    '  AuthService ->> System: SessionAPI:refresh(token: string?):Refresh session',
    'end',
    'par notify downstream',
    '  orders ->> BillingService: BillingAPI:charge(total: number, currency: string)',
    'and track audit',
    '  orders -> System: audit trail',
    'end',
].join('\n')

async function loadFixture(page: Page, value: string): Promise<void> {
    await page.addInitScript((storageValue) => {
        localStorage.setItem('integra-system', storageValue)
    }, value)
    await page.goto('/')
}

async function openEmptySequenceEditor(page: Page): Promise<Locator> {
    await page.getByRole('treeitem').filter({ hasText: 'New Flow' }).first().click()
    const editor = page.locator('.cm-content[contenteditable="true"]')
    await expect(editor).toBeVisible()
    return editor
}

async function writeSpec(page: Page, editor: Locator, spec: string): Promise<void> {
    await editor.click()
    await page.keyboard.insertText(spec)
    await page.locator('body').click({ position: { x: 10, y: 10 } })
    await page.locator(`${diagramSelector} svg`).waitFor()
}

test.describe('sequence diagram grammar coverage', () => {
    test.beforeEach(async ({ page }) => {
        await loadFixture(page, makeLocalStorageValueWithEmptySeq())
    })

    test('renders documented sequence grammar variants in the UI', async ({ page }) => {
        const editor = await openEmptySequenceEditor(page)
        await writeSpec(page, editor, sequenceGrammarSpec)

        const diagram = page.locator(diagramSelector)
        await expect(diagram).toContainText('Log in')
        await expect(diagram).toContainText('Place order')
        await expect(diagram).toContainText('Refresh session')
        await expect(diagram).toContainText('entering credentials')
        await expect(diagram).toContainText('validates session')
        await expect(diagram).toContainText('shared processing state')
        await expect(diagram).toContainText('retry with backoff')
        await expect(diagram).toContainText('approved')
        await expect(diagram).toContainText('rejected')
        await expect(diagram).toContainText(/remember me\s*enabled/)
        await expect(diagram).toContainText('notify downstream')
        await expect(diagram).toContainText('track audit')
        await expect(diagram).toContainText('End User')
        await expect(diagram).toContainText('Output Topics')
    })

    test('updates participants without creating a duplicate self-reference node', async ({
        page,
    }) => {
        const editor = await openEmptySequenceEditor(page)
        await writeSpec(page, editor, sequenceGrammarSpec)

        await expect(page.getByRole('treeitem').filter({ hasText: 'End User' })).toBeVisible()
        await expect(page.getByRole('treeitem').filter({ hasText: 'Output Topics' })).toBeVisible()
        await expect(page.getByRole('treeitem').filter({ hasText: 'BillingService' })).toBeVisible()
        await expect(page.getByRole('treeitem').filter({ hasText: 'AuthService' })).toHaveCount(1)
        await expect(page.getByRole('treeitem').filter({ hasText: /^System$/ })).toHaveCount(1)
        await expect(page.getByRole('treeitem').filter({ hasText: /^orders$/ })).toHaveCount(0)
    })
})
