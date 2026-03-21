import type { Page } from '@playwright/test'

type PersistedState = {
    state?: Record<string, unknown>
    [key: string]: unknown
}

function withEditMode(storageValue: string | null): string | null {
    if (!storageValue) return storageValue

    try {
        const parsed = JSON.parse(storageValue) as PersistedState
        return JSON.stringify({
            ...parsed,
            state: {
                ...parsed.state,
                uiMode: 'edit',
            },
        })
    } catch {
        return storageValue
    }
}

export async function ensureEditMode(page: Page): Promise<void> {
    const switchToEdit = page.getByLabel('Switch to edit mode')
    if (await switchToEdit.isVisible().catch(() => false)) {
        await switchToEdit.click()
    }
}

export async function loadAppWithFixture(page: Page, value: string): Promise<void> {
    await page.addInitScript((storageValue) => {
        localStorage.setItem('integra-system', storageValue)
    }, withEditMode(value))
    await gotoHome(page)
}

export async function gotoHome(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const storageValue = localStorage.getItem('integra-system')
        if (!storageValue) return
        try {
            const parsed = JSON.parse(storageValue) as PersistedState
            localStorage.setItem(
                'integra-system',
                JSON.stringify({
                    ...parsed,
                    state: {
                        ...parsed.state,
                        uiMode: 'edit',
                    },
                })
            )
        } catch {
            // Ignore malformed persisted state in the test helper and let the app handle it.
        }
    })
    await page.goto('/')
    await ensureEditMode(page)
}
