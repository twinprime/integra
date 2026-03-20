import { test, expect, type Locator, type Page } from '@playwright/test'
import {
    codeMirrorEditor,
    getVisibleCodeMirrorEditor,
    nodeIdInput,
    replaceCodeMirrorContent,
    saveEditorByBlurring,
    selectTreeItem,
    specificationEditor,
} from './helpers/interactions'
import { loadAppWithFixture } from './helpers/app'
import {
    makeLocalStorageValue,
    makeLocalStorageValueWithInheritance,
} from './fixtures/sample-system'

const diagramSvg = (page: Page): Locator =>
    page.locator('[data-testid="diagram-svg-container"] svg')

const syntaxErrorBanner = (page: Page): Locator =>
    page
        .locator('button.text-red-500')
        .filter({ hasText: /Line|Expecting|expecting/i })
        .first()

const scopeErrorBanner = (page: Page): Locator =>
    page
        .locator('button.text-red-500')
        .filter({ hasText: /out of scope/i })
        .first()

async function openDiagramEditor(page: Page, treeItemText: string | RegExp): Promise<Locator> {
    await selectTreeItem(page, treeItemText)
    const emptyState = page.getByRole('button', { name: 'Click to edit specification' })
    const preview = page.getByRole('button', { name: 'Diagram specification — click to edit' })

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const editor = codeMirrorEditor(page)
        if (await editor.count()) {
            return getVisibleCodeMirrorEditor(page)
        }

        if (await emptyState.isVisible()) {
            await emptyState.click()
        } else if (await preview.isVisible()) {
            await preview.click()
        }

        if (attempt < 2) {
            await page.waitForTimeout(200)
        }
    }

    return getVisibleCodeMirrorEditor(page, 10000)
}

test.describe('diagram validation errors', () => {
    test('invalid sequence syntax shows an error banner, keeps the previous render, and clears after fixing the spec', async ({
        page,
    }) => {
        await loadAppWithFixture(page, makeLocalStorageValue())
        await selectTreeItem(page, 'Login Flow')

        await expect(diagramSvg(page)).toBeVisible()
        await expect(page.locator('[data-testid="diagram-svg-container"]')).toContainText('done')
        await expect(syntaxErrorBanner(page)).toHaveCount(0)

        const editor = await openDiagramEditor(page, 'Login Flow')
        await replaceCodeMirrorContent(
            page,
            editor,
            ['actor User', 'component AuthService', 'component OrderService', 'User ->>'].join('\n')
        )
        await saveEditorByBlurring(page)

        await expect(syntaxErrorBanner(page)).toBeVisible()
        await expect(diagramSvg(page)).toBeVisible()
        await expect(page.locator('[data-testid="diagram-svg-container"]')).toContainText('done')

        const fixedEditor = await openDiagramEditor(page, 'Login Flow')
        await replaceCodeMirrorContent(
            page,
            fixedEditor,
            [
                'actor User',
                'component AuthService',
                'component OrderService',
                'User ->> AuthService: IAuth:login()',
                'AuthService -->> User: signed in',
                'opt if order pending',
                '  User ->> AuthService: IAuth:login()',
                'end',
                'User ->> OrderService: UseCase:OrderService/PlaceOrder:Place an order',
            ].join('\n')
        )
        await saveEditorByBlurring(page)

        await expect(syntaxErrorBanner(page)).toHaveCount(0)
        await expect(diagramSvg(page)).toBeVisible()
        await expect(page.locator('[data-testid="diagram-svg-container"]')).toContainText(
            'signed in'
        )
        await expect(page.locator('[data-testid="diagram-svg-container"]')).not.toContainText(
            'done'
        )
        await expect(specificationEditor(page)).toContainText('AuthService -->> User: signed in')
    })

    test('out-of-scope cross-component path reference is rejected without creating the referenced node', async ({
        page,
    }) => {
        await loadAppWithFixture(page, makeLocalStorageValue())

        const editor = await openDiagramEditor(page, 'Order Use Cases')
        await replaceCodeMirrorContent(
            page,
            editor,
            [
                'actor User',
                'use case PlaceOrder',
                'component AuthService/NewModule as authModule',
                'User ->> PlaceOrder',
                'authModule ->> PlaceOrder',
            ].join('\n')
        )
        await saveEditorByBlurring(page)

        await expect(scopeErrorBanner(page)).toBeVisible()
        await expect(page.getByRole('treeitem').filter({ hasText: 'NewModule' })).toHaveCount(0)

        const fixedEditor = await openDiagramEditor(page, 'Order Use Cases')
        await replaceCodeMirrorContent(
            page,
            fixedEditor,
            ['actor User', 'use case PlaceOrder', 'User ->> PlaceOrder'].join('\n')
        )
        await saveEditorByBlurring(page)

        await expect(scopeErrorBanner(page)).toHaveCount(0)
        await expect(diagramSvg(page)).toBeVisible()
        await expect(page.getByRole('treeitem').filter({ hasText: 'NewModule' })).toHaveCount(0)
    })

    test('inherited interfaces store child-local functions that are not present on the parent interface', async ({
        page,
    }) => {
        await loadAppWithFixture(page, makeLocalStorageValueWithInheritance())
        await selectTreeItem(page, 'Login Flow')

        await expect(diagramSvg(page)).toBeVisible()
        await expect(page.locator('[data-testid="diagram-svg-container"]')).toContainText('done')

        const editor = await openDiagramEditor(page, 'Login Flow')
        await replaceCodeMirrorContent(
            page,
            editor,
            [
                'actor User',
                'component AuthService',
                'User ->> AuthService: IAuthDerived:newDerivedFn()',
            ].join('\n')
        )
        await saveEditorByBlurring(page)

        await expect(diagramSvg(page)).toBeVisible()
        await expect(page.locator('button.text-red-500')).toHaveCount(0)
        await expect(page.locator('[data-testid="diagram-svg-container"]')).toContainText(
            'newDerivedFn'
        )

        await selectTreeItem(page, 'AuthService')
        await page.getByTestId('interface-tab-IAuthDerived').click()
        await expect(page.getByTestId('interface-tab-panel')).toContainText('doThing')
        await expect(page.getByTestId('interface-tab-panel')).toContainText(
            'Child-added functions (1)'
        )
        await expect(page.getByLabel('Function ID')).toHaveValue('newDerivedFn')
    })
})

test.describe('node id validation', () => {
    test('duplicate sibling node IDs show an inline validation error and do not save', async ({
        page,
    }) => {
        await loadAppWithFixture(page, makeLocalStorageValue())
        await selectTreeItem(page, 'AuthService')

        const idInput = nodeIdInput(page)
        await expect(idInput).toHaveValue('AuthService')

        await idInput.clear()
        await idInput.fill('OrderService')
        await idInput.press('Enter')

        await expect(
            page.getByText('ID "OrderService" is already used by a sibling node')
        ).toBeVisible()
        await expect(idInput).toHaveValue('OrderService')

        await page.locator('body').click({ position: { x: 10, y: 10 } })
        await expect(
            page.getByText('ID "OrderService" is already used by a sibling node')
        ).toBeVisible()
        await expect(page.getByRole('treeitem').filter({ hasText: /^AuthService$/ })).toBeVisible()
        await expect(page.getByRole('treeitem').filter({ hasText: /^OrderService$/ })).toBeVisible()
    })
})
