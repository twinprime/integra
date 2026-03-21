import { test, expect, type Page } from '@playwright/test'
import { gotoHome } from './helpers/app'
import {
    codeMirrorEditor,
    getVisibleCodeMirrorEditor,
    revealTreeItem,
    saveEditorByBlurring,
    selectTreeItem,
    treeItem,
} from './helpers/interactions'

async function createNodeFromContextMenu(
    page: Page,
    targetText: string | RegExp,
    actionName: 'Add Sub-component' | 'Add Use Case Diagram' | 'Add Sequence Diagram',
    id: string,
    placeholder: string
): Promise<void> {
    await treeItem(page, targetText).click({ button: 'right' })
    await page.getByRole('button', { name: actionName }).click()
    await page.getByPlaceholder(placeholder).fill(id)
    await page.getByRole('button', { name: 'Create' }).click()
}

async function openDiagramEditor(page: Page, targetText: string | RegExp) {
    await selectTreeItem(page, targetText)
    const targetLabel =
        typeof targetText === 'string'
            ? targetText
            : targetText.source.replace(/^\^/, '').replace(/\$$/, '')
    await expect(page.getByLabel('Node name')).toHaveValue(targetLabel, { timeout: 10000 })

    const emptyState = page.getByRole('button', { name: 'Click to edit specification' })
    const preview = page.getByRole('button', { name: 'Diagram specification — click to edit' })
    let sawStableEditor = false

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const editor = codeMirrorEditor(page)
        const emptyVisible = await emptyState.isVisible().catch(() => false)
        const previewVisible = await preview.isVisible().catch(() => false)

        if (emptyVisible) {
            await emptyState.click()
            return getVisibleCodeMirrorEditor(page, 10000)
        }

        if (previewVisible) {
            await preview.click()
            return getVisibleCodeMirrorEditor(page, 10000)
        }

        const editorVisible = await editor.isVisible().catch(() => false)
        if (editorVisible) {
            if (sawStableEditor) {
                return getVisibleCodeMirrorEditor(page, 10000)
            }
            sawStableEditor = true
        } else {
            sawStableEditor = false
        }

        await page.waitForTimeout(100)
    }

    throw new Error(`Could not open the specification editor for ${targetLabel}`)
}

async function authorLoginWorkflow(page: Page): Promise<void> {
    await gotoHome(page)

    await expect(treeItem(page, /^My System$/)).toBeVisible()

    await createNodeFromContextMenu(
        page,
        /^My System$/,
        'Add Sub-component',
        'auth_service',
        'my_service'
    )
    await expect(treeItem(page, /^Auth Service$/)).toBeVisible()

    await createNodeFromContextMenu(
        page,
        /^Auth Service$/,
        'Add Use Case Diagram',
        'user_journeys',
        'my_feature'
    )
    await expect(treeItem(page, /^User Journeys$/)).toBeVisible()

    const useCaseEditor = await openDiagramEditor(page, /^User Journeys$/)
    await useCaseEditor.type(['actor user', 'use case login', 'user ->> login'].join('\n'))
    await saveEditorByBlurring(page)

    await expect(await revealTreeItem(page, /^User$/)).toBeVisible()
    await expect(await revealTreeItem(page, /^Login$/)).toBeVisible()

    await createNodeFromContextMenu(
        page,
        /^Login$/,
        'Add Sequence Diagram',
        'login_flow',
        'my_feature'
    )
    await expect(treeItem(page, /^Login Flow$/)).toBeVisible()

    const sequenceEditor = await openDiagramEditor(page, /^Login Flow$/)
    await sequenceEditor.type(
        [
            'actor user',
            'component auth_service',
            'component session_store',
            'user ->> auth_service: IAuth:login(email: string, password: string)',
            'auth_service ->> session_store: ISession:create_session(user_id: string)',
            'auth_service ->> user: UseCase:login',
        ].join('\n')
    )
    await saveEditorByBlurring(page)
}

async function expectDiagramSvg(page: Page): Promise<void> {
    const svgContainer = page.locator('[data-testid="diagram-svg-container"]')
    await svgContainer.waitFor({ timeout: 15000 })
    await expect(svgContainer.locator('svg')).toBeVisible({ timeout: 15000 })
    await expect(
        page.locator('text=Parse error').or(page.locator('text=Invalid Diagram'))
    ).not.toBeVisible()
}

test.describe('authoring workflows from a clean system', () => {
    test('builds a login workflow through the UI and shows derived state', async ({ page }) => {
        await authorLoginWorkflow(page)

        await expect(treeItem(page, /^Session Store$/)).toBeVisible()

        await selectTreeItem(page, /^Login$/)
        await expectDiagramSvg(page)

        await selectTreeItem(page, /^Auth Service$/)
        await expect(page.getByTestId('interface-tab-IAuth')).toBeVisible()
        await page.getByTestId('interface-tab-IAuth').click()
        const authInterfacePanel = page.getByTestId('interface-tab-panel')
        await expect(authInterfacePanel.getByLabel('Function ID')).toHaveValue('login')
        await expect(authInterfacePanel).toContainText('email')
        await expect(authInterfacePanel).toContainText('password')
        await expectDiagramSvg(page)

        const authClassNodes = page.locator(
            '[data-testid="diagram-svg-container"] .classGroup, [data-testid="diagram-svg-container"] .node, [data-testid="diagram-svg-container"] g.classBox'
        )
        expect(await authClassNodes.count()).toBeGreaterThan(1)

        await selectTreeItem(page, /^Session Store$/)
        await expect(page.getByTestId('interface-tab-ISession')).toBeVisible()
        await page.getByTestId('interface-tab-ISession').click()
        const sessionInterfacePanel = page.getByTestId('interface-tab-panel')
        await expect(sessionInterfacePanel.getByLabel('Function ID')).toHaveValue('create_session')
        await expect(sessionInterfacePanel).toContainText('user_id')
    })

    test('persists authored workflow outcomes across reload', async ({ page }) => {
        await authorLoginWorkflow(page)

        await page.waitForTimeout(300)
        await page.reload()

        await expect(await revealTreeItem(page, /^Auth Service$/)).toBeVisible()
        await expect(await revealTreeItem(page, /^Session Store$/)).toBeVisible()
        await expect(await revealTreeItem(page, /^User Journeys$/)).toBeVisible()
        await expect(await revealTreeItem(page, /^Login$/)).toBeVisible()
        await expect(await revealTreeItem(page, /^Login Flow$/)).toBeVisible()

        await selectTreeItem(page, /^Login Flow$/)
        await expect(
            page.getByRole('button', { name: 'Diagram specification — click to edit' })
        ).toContainText('IAuth:login')
        await expect(
            page.getByRole('button', { name: 'Diagram specification — click to edit' })
        ).toContainText('ISession:create_session')

        await selectTreeItem(page, /^Auth Service$/)
        await expect(page.getByTestId('interface-tab-IAuth')).toBeVisible()
        await page.getByTestId('interface-tab-IAuth').click()
        await expect(page.getByTestId('interface-tab-panel').getByLabel('Function ID')).toHaveValue(
            'login'
        )
    })
})
