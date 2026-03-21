// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SystemState } from '../../store/useSystemStore'
import { TreeToolbar } from './TreeToolbar'

vi.mock('../../assets/integra-logo.svg', () => ({
    default: 'integra-logo.svg',
}))

vi.mock('../../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

import { useSystemStore } from '../../store/useSystemStore'

const mockToggleUiMode = vi.fn()
const treeActive = { current: false }

function setupStoreMock(uiMode: 'browse' | 'edit' = 'browse') {
    const state = {
        rootComponent: {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
        },
        setSystem: vi.fn(),
        clearSystem: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        goBack: vi.fn(),
        goForward: vi.fn(),
        savedSnapshot: 'snapshot',
        markSaved: vi.fn(),
        canNavBack: false,
        canNavForward: false,
        past: [],
        future: [],
        uiMode,
        toggleUiMode: mockToggleUiMode,
    }

    vi.mocked(useSystemStore).mockImplementation((selector: (store: SystemState) => unknown) =>
        selector(state as unknown as SystemState)
    )
}

describe('TreeToolbar', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setupStoreMock()
    })

    it('hides undo, redo, save, and clear in browse mode', () => {
        render(<TreeToolbar treeActive={treeActive} />)

        expect(screen.queryByTitle('Undo (Cmd+Z)')).not.toBeInTheDocument()
        expect(screen.queryByTitle('Redo (Cmd+Shift+Z)')).not.toBeInTheDocument()
        expect(screen.queryByTitle('Save system to YAML file')).not.toBeInTheDocument()
        expect(screen.queryByTitle('Clear system')).not.toBeInTheDocument()
        expect(screen.getByTitle('Load system from YAML file')).toBeInTheDocument()
    })

    it('shows edit-only actions and decoration in edit mode', () => {
        setupStoreMock('edit')

        render(<TreeToolbar treeActive={treeActive} />)

        expect(screen.getByTitle('Undo (Cmd+Z)')).toBeInTheDocument()
        expect(screen.getByTitle('Redo (Cmd+Shift+Z)')).toBeInTheDocument()
        expect(screen.getByTitle('Save system to YAML file')).toBeInTheDocument()
        expect(screen.getByTitle('Clear system')).toBeInTheDocument()
        expect(screen.getByLabelText('Switch to browse mode')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
    })

    it('toggles mode when the Integra icon is clicked', async () => {
        const user = userEvent.setup()

        render(<TreeToolbar treeActive={treeActive} />)

        await user.click(screen.getByLabelText('Switch to edit mode'))

        expect(mockToggleUiMode).toHaveBeenCalledTimes(1)
    })
})
