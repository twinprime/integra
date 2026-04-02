import { test, expect } from '@playwright/test'

const ROOT_YAML = `
uuid: e2e-model-uuid
id: e2e-system
name: E2E Test System
type: component
description: A test system for e2e testing
subComponents: []
actors: []
useCaseDiagrams: []
interfaces: []
`.trim()

const ROOT_WITH_CHILD_YAML = `
uuid: e2e-parent-uuid
id: e2e-parent
name: E2E Parent System
type: component
description: Parent system with sub-component
subComponents:
  - e2e-parent/root-child.yaml
actors: []
useCaseDiagrams: []
interfaces: []
`.trim()

const CHILD_YAML = `
uuid: e2e-child-uuid
id: e2e-child
name: E2E Child Service
type: component
description: A child service
subComponents: []
actors: []
useCaseDiagrams: []
interfaces: []
`.trim()

test.describe('/models/:component-id route', () => {
    test('loads a root component from /models/<id>.yaml and locks browse mode', async ({
        page,
    }) => {
        await page.route('/models/e2e-system.yaml', (route) =>
            route.fulfill({ status: 200, contentType: 'text/yaml', body: ROOT_YAML })
        )

        await page.goto('/models/e2e-system')

        // Component name appears in tree
        await expect(page.getByText('E2E Test System')).toBeVisible()

        // Icon is in locked browse mode
        const icon = page.getByLabel('Browse mode (locked)')
        await expect(icon).toBeVisible()
        await expect(icon).toHaveAttribute('aria-disabled', 'true')

        // Edit-mode controls are hidden
        await expect(page.getByTitle('Undo (Cmd+Z)')).not.toBeVisible()

        // Clicking the icon does not switch to edit mode
        await icon.click({ force: true })
        await expect(page.getByLabel('Browse mode (locked)')).toBeVisible()
        await expect(page.getByTitle('Undo (Cmd+Z)')).not.toBeVisible()
    })

    test('recursively loads sub-components', async ({ page }) => {
        await page.route('/models/e2e-parent.yaml', (route) =>
            route.fulfill({ status: 200, contentType: 'text/yaml', body: ROOT_WITH_CHILD_YAML })
        )
        await page.route('/models/e2e-parent/root-child.yaml', (route) =>
            route.fulfill({ status: 200, contentType: 'text/yaml', body: CHILD_YAML })
        )

        await page.goto('/models/e2e-parent')

        await expect(page.getByText('E2E Parent System')).toBeVisible()
        await expect(page.getByText('E2E Child Service')).toBeVisible()
    })

    test('shows 404 page when YAML is not found', async ({ page }) => {
        await page.route('/models/nonexistent.yaml', (route) =>
            route.fulfill({ status: 404, body: 'Not Found' })
        )

        await page.goto('/models/nonexistent')

        await expect(page.getByText('404')).toBeVisible()
        await expect(page.getByText('Model not found')).toBeVisible()
        await expect(page.getByText('nonexistent')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Go to app' })).toBeVisible()
    })

    test('"Go to app" link navigates to home', async ({ page }) => {
        await page.route('/models/nonexistent.yaml', (route) =>
            route.fulfill({ status: 404, body: 'Not Found' })
        )

        await page.goto('/models/nonexistent')
        await page.getByRole('link', { name: 'Go to app' }).click()

        await expect(page).toHaveURL('/')
    })

    test('shows error page on non-404 fetch failure', async ({ page }) => {
        await page.route('/models/broken.yaml', (route) =>
            route.fulfill({ status: 500, body: 'Internal Server Error' })
        )

        await page.goto('/models/broken')

        await expect(page.getByText('Failed to load model')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Go to app' })).toBeVisible()
    })

    test('normal route is unaffected', async ({ page }) => {
        await page.goto('/')

        // Default browse mode toggle is NOT locked
        const icon = page.getByLabel('Switch to edit mode')
        await expect(icon).toBeVisible()
        await icon.click()
        await expect(page.getByLabel('Switch to browse mode')).toBeVisible()
    })
})
