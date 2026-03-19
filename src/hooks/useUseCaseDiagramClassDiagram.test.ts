import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { RenderResult } from 'mermaid'
import type { ComponentNode, UseCaseDiagramNode } from '../store/types'
import type { SystemState } from '../store/useSystemStore'
import { useUseCaseDiagramClassDiagram } from './useUseCaseDiagramClassDiagram'

vi.mock('mermaid', () => ({
    default: {
        initialize: vi.fn(),
        render: vi
            .fn()
            .mockResolvedValue({ svg: '<svg>uc-diagram-class</svg>', bindFunctions: undefined }),
    },
}))

vi.mock('../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

vi.mock('../utils/useCaseDiagramClassDiagram', () => ({
    buildUseCaseDiagramClassDiagram: vi.fn().mockReturnValue({
        mermaidContent: 'classDiagram\n  class UCD',
        idToUuid: { UCD: 'ucd-uuid' },
        relationshipMetadata: [],
    }),
}))

import mermaid from 'mermaid'
import { useSystemStore } from '../store/useSystemStore'
import { buildUseCaseDiagramClassDiagram } from '../utils/useCaseDiagramClassDiagram'

const mockSelectNode = vi.fn()

const mockRootComponent: ComponentNode = {
    uuid: 'root-uuid',
    id: 'root',
    name: 'Root',
    type: 'component',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

const mockUseCaseDiagramNode: UseCaseDiagramNode = {
    uuid: 'ucd-uuid',
    id: 'ucd',
    name: 'My Use Case Diagram',
    type: 'use-case-diagram',
    content: '',
    description: '',
    ownerComponentUuid: 'root-uuid',
    referencedNodeIds: [],
    useCases: [],
}

describe('useUseCaseDiagramClassDiagram', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
            selector({
                rootComponent: mockRootComponent,
                selectNode: mockSelectNode,
                showGeneratedClassDiagramInterfaces: true,
            } as unknown as SystemState)
        )
        vi.mocked(mermaid.render).mockResolvedValue({
            svg: '<svg>uc-diagram-class</svg>',
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)
        vi.mocked(buildUseCaseDiagramClassDiagram).mockReturnValue({
            mermaidContent: 'classDiagram\n  class UCD',
            idToUuid: { UCD: 'ucd-uuid' },
            relationshipMetadata: [],
        })
    })

    it('returns SVG when a use-case diagram node is provided', async () => {
        const { result } = renderHook(() => useUseCaseDiagramClassDiagram(mockUseCaseDiagramNode))

        await waitFor(() => expect(result.current.svg).toBe('<svg>uc-diagram-class</svg>'))
        expect(result.current.error).toBe('')
    })

    it('delegates to buildUseCaseDiagramClassDiagram', async () => {
        const { result } = renderHook(() => useUseCaseDiagramClassDiagram(mockUseCaseDiagramNode))

        await waitFor(() => expect(result.current.svg).toBe('<svg>uc-diagram-class</svg>'))
        expect(buildUseCaseDiagramClassDiagram).toHaveBeenCalledWith(
            mockUseCaseDiagramNode,
            mockRootComponent,
            { showInterfaces: true }
        )
    })

    it('uses uc-diagram-class idPrefix in the Mermaid render id', async () => {
        const { result } = renderHook(() => useUseCaseDiagramClassDiagram(mockUseCaseDiagramNode))

        await waitFor(() => expect(result.current.svg).toBe('<svg>uc-diagram-class</svg>'))
        expect(mermaid.render).toHaveBeenCalledWith(
            expect.stringMatching(/^mermaid-uc-diagram-class-\d+$/),
            expect.any(String)
        )
    })
})
