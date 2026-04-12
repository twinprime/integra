import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NodePathEditorRow } from './NodePathEditorRow'
import type { ComponentNode } from '../../store/types'
import type { SystemState } from '../../store/useSystemStore'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

// Default: node lives directly in System/Auth, id = loginFlow
vi.mock('../../utils/nodeUtils', () => ({
    getNodeAbsolutePath: vi.fn(() => 'System/Auth/loginFlow'),
    getNodeAbsolutePathSegments: vi.fn(() => [
        { uuid: 'root-uuid', id: 'System' },
        { uuid: 'auth-uuid', id: 'Auth' },
        { uuid: 'node-uuid', id: 'loginFlow' },
    ]),
    findNearestComponentAncestor: vi.fn(() => ({
        uuid: 'auth-uuid',
        id: 'Auth',
        type: 'component',
    })),
    // Default: returns owner-comp path 'System/Auth'; for component-type tests
    // override per-test to return the component's own path.
    getComponentAbsolutePath: vi.fn((_root: unknown, uuid: string) =>
        uuid === 'node-uuid' ? 'System/Auth/loginFlow' : 'System/Auth'
    ),
}))

import { useSystemStore } from '../../store/useSystemStore'
import {
    getNodeAbsolutePath,
    getNodeAbsolutePathSegments,
    findNearestComponentAncestor,
    getComponentAbsolutePath,
} from '../../utils/nodeUtils'

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
    // Restore default implementations after vi.clearAllMocks clears them
    vi.mocked(getNodeAbsolutePath).mockReturnValue('System/Auth/loginFlow')
    vi.mocked(getNodeAbsolutePathSegments).mockReturnValue([
        { uuid: 'root-uuid', id: 'System' },
        { uuid: 'auth-uuid', id: 'Auth' },
        { uuid: 'node-uuid', id: 'loginFlow' },
    ])
    vi.mocked(findNearestComponentAncestor).mockReturnValue({
        uuid: 'auth-uuid',
        id: 'Auth',
        type: 'component',
    } as ComponentNode)
    vi.mocked(getComponentAbsolutePath).mockImplementation((_root: unknown, uuid: string) =>
        uuid === 'node-uuid' ? 'System/Auth/loginFlow' : 'System/Auth'
    )
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

        it('copies Sequence: prefixed path omitting intermediate ucd/uc segments', async () => {
            // Bug: full path is System/Auth/AuthUCD/Login/loginFlow but copied ref
            // should be Sequence:System/Auth/loginFlow (compPath/seqId only)
            vi.mocked(getNodeAbsolutePath).mockReturnValue('System/Auth/AuthUCD/Login/loginFlow')
            vi.mocked(getNodeAbsolutePathSegments).mockReturnValue([
                { uuid: 'root-uuid', id: 'System' },
                { uuid: 'auth-uuid', id: 'Auth' },
                { uuid: 'ucd-uuid', id: 'AuthUCD' },
                { uuid: 'uc-uuid', id: 'Login' },
                { uuid: 'node-uuid', id: 'loginFlow' },
            ])
            vi.mocked(findNearestComponentAncestor).mockReturnValue({
                uuid: 'auth-uuid',
                id: 'Auth',
                type: 'component',
            } as ComponentNode)
            vi.mocked(getComponentAbsolutePath).mockReturnValue('System/Auth')

            render(<NodePathEditorRow {...defaultProps} nodeType="sequence-diagram" />)
            fireEvent.click(screen.getByTitle('Copy spec reference'))
            await waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('Sequence:System/Auth/loginFlow')
            })
        })

        it('copies Sequence: prefixed path for sequence-diagram nodes', async () => {
            render(<NodePathEditorRow {...defaultProps} nodeType="sequence-diagram" />)
            fireEvent.click(screen.getByTitle('Copy spec reference'))
            await waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('Sequence:System/Auth/loginFlow')
            })
        })

        it('copies UseCase: prefixed path omitting the ucd segment', async () => {
            vi.mocked(getNodeAbsolutePath).mockReturnValue('System/Auth/AuthUCD/myUseCase')
            vi.mocked(getNodeAbsolutePathSegments).mockReturnValue([
                { uuid: 'root-uuid', id: 'System' },
                { uuid: 'auth-uuid', id: 'Auth' },
                { uuid: 'ucd-uuid', id: 'AuthUCD' },
                { uuid: 'node-uuid', id: 'myUseCase' },
            ])
            vi.mocked(getComponentAbsolutePath).mockReturnValue('System/Auth')

            render(<NodePathEditorRow {...defaultProps} nodeType="use-case" />)
            fireEvent.click(screen.getByTitle('Copy spec reference'))
            await waitFor(() => {
                expect(mockWriteText).toHaveBeenCalledWith('UseCase:System/Auth/myUseCase')
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
