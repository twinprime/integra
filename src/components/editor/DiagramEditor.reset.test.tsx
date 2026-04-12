import { useEffect, useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiagramEditor } from './DiagramEditor'
import type { SequenceDiagramNode } from '../../store/types'
import type { FunctionMatch } from '../../parser/sequenceDiagram/systemUpdater'
import type { SystemState } from '../../store/useSystemStore'

vi.mock('../../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
    getSequenceDiagrams: vi.fn(() => []),
}))

vi.mock('../../parser/sequenceDiagram/systemUpdater', async () => {
    const actual = await vi.importActual<
        typeof import('../../parser/sequenceDiagram/systemUpdater')
    >('../../parser/sequenceDiagram/systemUpdater')
    return {
        ...actual,
        analyzeSequenceDiagramChanges: vi.fn<() => FunctionMatch[]>(() => []),
    }
})

vi.mock('./MarkdownEditor', () => ({
    MarkdownEditor: ({ value }: { value: string }) => (
        <button data-testid="markdown-preview">{value || 'No Description'}</button>
    ),
}))

vi.mock('./NodeReferencesButton', () => ({
    NodeReferencesButton: () => null,
}))

vi.mock('../FunctionUpdateDialog', () => ({
    FunctionUpdateDialog: () => null,
}))

vi.mock('../../utils/nodeUtils', () => ({
    findReferencingDiagrams: vi.fn(() => []),
    getNodeAbsolutePath: vi.fn(() => ''),
    getNodeAbsolutePathSegments: vi.fn(() => []),
    findNearestComponentAncestor: vi.fn(() => null),
    getComponentAbsolutePath: vi.fn(() => ''),
}))

vi.mock('../../nodes/nodeTree', async () => {
    const actual =
        await vi.importActual<typeof import('../../nodes/nodeTree')>('../../nodes/nodeTree')
    return {
        ...actual,
        getNodeSiblingIds: vi.fn(() => []),
    }
})

const mockEditorUnmount = vi.fn()

vi.mock('./DiagramCodeMirrorEditor', () => {
    let nextInstanceId = 1

    return {
        DiagramCodeMirrorEditor: ({ content }: { content: string }) => {
            const instanceIdRef = useRef<number | null>(null)
            if (instanceIdRef.current === null) {
                instanceIdRef.current = nextInstanceId++
            }

            useEffect(() => {
                return () => {
                    mockEditorUnmount(instanceIdRef.current)
                }
            }, [])

            return (
                <div data-testid="diagram-editor-instance">
                    instance:{instanceIdRef.current}|content:{content}
                </div>
            )
        },
    }
})

import { useSystemStore } from '../../store/useSystemStore'

const mockApplyFunctionUpdates = vi.fn()
const mockClearParseError = vi.fn()
const mockRenameNodeId = vi.fn()
const mockSelectInterface = vi.fn()
const mockSelectNode = vi.fn()

const mockRootComponent = {
    uuid: 'root-component-uuid',
    id: 'root',
    name: 'Root',
    type: 'component' as const,
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

function setupStoreMock() {
    const state = {
        rootComponent: mockRootComponent,
        applyFunctionUpdates: mockApplyFunctionUpdates,
        parseError: null,
        clearParseError: mockClearParseError,
        selectNode: mockSelectNode,
        selectInterface: mockSelectInterface,
        renameNodeId: mockRenameNodeId,
    }

    vi.mocked(useSystemStore).mockImplementation((selector?: (store: SystemState) => unknown) =>
        selector ? selector(state as unknown as SystemState) : state
    )
}

function makeSequenceDiagramNode(
    overrides: Partial<SequenceDiagramNode> = {}
): SequenceDiagramNode {
    return {
        uuid: 'sequence-diagram-uuid',
        id: 'LoginFlow',
        name: 'Login Flow',
        type: 'sequence-diagram',
        description: '',
        ownerComponentUuid: 'root-component-uuid',
        referencedNodeIds: [],
        referencedFunctionUuids: [],
        content: 'actor User\ncomponent AuthService\nUser ->> AuthService: IAuth:login()',
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    setupStoreMock()
})

describe('DiagramEditor reset behavior', () => {
    it('remounts the specification editor when switching to a different diagram node', () => {
        const { rerender } = render(
            <DiagramEditor node={makeSequenceDiagramNode()} onUpdate={vi.fn()} />
        )

        expect(screen.getByTestId('diagram-editor-instance')).toHaveTextContent(
            'instance:1|content:actor User'
        )

        rerender(
            <DiagramEditor
                node={makeSequenceDiagramNode({
                    uuid: 'other-sequence-diagram-uuid',
                    id: 'AdminFlow',
                    name: 'Admin Flow',
                    content: 'actor Admin\ncomponent Portal\nAdmin ->> Portal: IPortal:login()',
                })}
                onUpdate={vi.fn()}
            />
        )

        expect(screen.getByTestId('diagram-editor-instance')).toHaveTextContent(
            'instance:2|content:actor Admin'
        )
        expect(mockEditorUnmount).toHaveBeenCalledWith(1)
    })
})
