import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NodePathEditorRow } from './NodePathEditorRow'
import type { SystemState } from '../../store/useSystemStore'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

vi.mock('../../utils/nodeUtils', () => ({
    getNodeAbsolutePath: vi.fn(() => 'System/Auth/loginFlow'),
    getNodeAbsolutePathSegments: vi.fn(() => [
        { uuid: 'root-uuid', id: 'System' },
        { uuid: 'auth-uuid', id: 'Auth' },
        { uuid: 'node-uuid', id: 'loginFlow' },
    ]),
}))

import { useSystemStore } from '../../store/useSystemStore'

const mockSelectNode = vi.fn()
const mockWriteText = vi.fn(() => Promise.resolve())

function setupStoreMock() {
    const state = {
        rootComponent: { uuid: 'root-uuid', id: 'System' },
        selectNode: mockSelectNode,
    }
    vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
        selector(state as unknown as SystemState)
    )
}

const defaultProps = {
    nodeUuid: 'node-uuid',
    localId: 'loginFlow',
    idError: null,
    onIdChange: vi.fn(),
    onIdBlur: vi.fn(),
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks()
    mockWriteText.mockResolvedValue(undefined)
    setupStoreMock()
    Object.defineProperty(navigator, 'clipboard', {
        get: () => ({ writeText: mockWriteText }),
        configurable: true,
    })
})

afterEach(() => {
    vi.useRealTimers()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NodePathEditorRow', () => {
    describe('copy button', () => {
        it('renders the copy button', () => {
            render(<NodePathEditorRow {...defaultProps} nodeType="sequence-diagram" />)
            expect(screen.getByTitle('Copy spec reference')).toBeInTheDocument()
        })

        it('copies Sequence: prefixed path for sequence-diagram nodes', async () => {
            render(<NodePathEditorRow {...defaultProps} nodeType="sequence-diagram" />)
            fireEvent.click(screen.getByTitle('Copy spec reference'))
            await waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('Sequence:System/Auth/loginFlow')
            })
        })

        it('copies UseCase: prefixed path for use-case nodes', async () => {
            render(<NodePathEditorRow {...defaultProps} nodeType="use-case" />)
            fireEvent.click(screen.getByTitle('Copy spec reference'))
            await waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('UseCase:System/Auth/loginFlow')
            })
        })

        it('copies UseCaseDiagram: prefixed path for use-case-diagram nodes', async () => {
            render(<NodePathEditorRow {...defaultProps} nodeType="use-case-diagram" />)
            fireEvent.click(screen.getByTitle('Copy spec reference'))
            await waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('UseCaseDiagram:System/Auth/loginFlow')
            })
        })

        it('copies plain path for component nodes', async () => {
            render(<NodePathEditorRow {...defaultProps} nodeType="component" />)
            fireEvent.click(screen.getByTitle('Copy spec reference'))
            await waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('System/Auth/loginFlow')
            })
        })

        it('copies plain path for actor nodes', async () => {
            render(<NodePathEditorRow {...defaultProps} nodeType="actor" />)
            fireEvent.click(screen.getByTitle('Copy spec reference'))
            await waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('System/Auth/loginFlow')
            })
        })
    })
})
