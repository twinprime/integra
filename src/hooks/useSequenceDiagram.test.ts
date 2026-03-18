import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSequenceDiagram } from './useSequenceDiagram'
import type { SequenceDiagramNode, ComponentNode } from '../store/types'
import type { SystemState } from '../store/useSystemStore'
import type { RenderResult } from 'mermaid'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('mermaid', () => ({
    default: {
        initialize: vi.fn(),
        render: vi.fn().mockResolvedValue({ svg: '<svg>seq</svg>', bindFunctions: undefined }),
    },
}))

vi.mock('../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

vi.mock('../nodes/nodeTree', () => ({
    findNode: vi.fn(),
}))

vi.mock('../parser/sequenceDiagram/mermaidGenerator', () => ({
    generateSequenceMermaid: vi.fn().mockReturnValue({
        mermaidContent: 'sequenceDiagram\n  A->>B: hello',
        idToUuid: { A: 'uuid-a', B: 'uuid-b' },
        messageLabelToUuid: { hello: 'fn-uuid' },
        messageLabelToInterfaceUuid: { hello: 'iface-uuid' },
        messageLinks: [
            {
                kind: 'functionRef',
                renderedLabel: 'hello',
                targetUuid: 'fn-uuid',
                interfaceUuid: 'iface-uuid',
                clickable: true,
            },
        ],
    }),
}))

import mermaid from 'mermaid'
import { useSystemStore } from '../store/useSystemStore'
import { findNode } from '../nodes/nodeTree'
import { generateSequenceMermaid } from '../parser/sequenceDiagram/mermaidGenerator'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSelectNode = vi.fn()
const mockSelectInterface = vi.fn()

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

const mockDiagramNode: SequenceDiagramNode = {
    uuid: 'seq-uuid',
    id: 'seq',
    name: 'Sequence Diagram',
    type: 'sequence-diagram',
    content: 'participant A\nparticipant B\nA->>B: hello',
    referencedNodeIds: [],
    ownerComponentUuid: 'root-uuid',
    referencedFunctionUuids: [],
}

function createSvgContainer(innerSvg: string): HTMLDivElement {
    const container = document.createElement('div')
    container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${innerSvg}</svg>`
    return container
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSequenceDiagram', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
            selector({
                rootComponent: mockRootComponent,
                selectNode: mockSelectNode,
                selectInterface: mockSelectInterface,
            } as unknown as SystemState)
        )
        vi.mocked(findNode).mockReturnValue(mockRootComponent)
        vi.mocked(mermaid.render).mockResolvedValue({
            svg: '<svg>seq</svg>',
            diagramType: 'sequence',
            bindFunctions: undefined,
        } satisfies RenderResult)
        vi.mocked(generateSequenceMermaid).mockReturnValue({
            mermaidContent: 'sequenceDiagram\n  A->>B: hello',
            idToUuid: { A: 'uuid-a', B: 'uuid-b' },
            messageLabelToUuid: { hello: 'fn-uuid' },
            messageLabelToInterfaceUuid: { hello: 'iface-uuid' },
            messageLinks: [
                {
                    kind: 'functionRef',
                    renderedLabel: 'hello',
                    targetUuid: 'fn-uuid',
                    interfaceUuid: 'iface-uuid',
                    clickable: true,
                },
            ],
        })
    })

    it('returns expected shape: svg, error, errorDetails, mermaidSource, elementRef, handleSequenceClick', () => {
        const { result } = renderHook(() => useSequenceDiagram(null))

        expect(result.current).toHaveProperty('svg')
        expect(result.current).toHaveProperty('error')
        expect(result.current).toHaveProperty('errorDetails')
        expect(result.current).toHaveProperty('mermaidSource')
        expect(result.current).toHaveProperty('elementRef')
        expect(result.current).toHaveProperty('handleSequenceClick')
        expect(typeof result.current.handleSequenceClick).toBe('function')
    })

    it('returns SVG after successful render', async () => {
        const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))

        await waitFor(() => expect(result.current.svg).toBe('<svg>seq</svg>'))
        expect(result.current.error).toBe('')
    })

    it('calls generateSequenceMermaid with diagram content and root component', async () => {
        const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))

        await waitFor(() => expect(result.current.svg).toBe('<svg>seq</svg>'))

        expect(generateSequenceMermaid).toHaveBeenCalledWith(
            mockDiagramNode.content,
            expect.anything(),
            mockRootComponent,
            mockDiagramNode.ownerComponentUuid
        )
    })

    it('returns error state when mermaid.render throws', async () => {
        vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('Sequence parse error'))

        const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))

        await waitFor(() => expect(result.current.error).toBe('Invalid Diagram Syntax'))
        expect(result.current.svg).toBe('')
    })

    it('returns empty state when diagramNode is null', async () => {
        const { result } = renderHook(() => useSequenceDiagram(null))

        await new Promise((r) => setTimeout(r, 20))

        expect(result.current.svg).toBe('')
        expect(result.current.error).toBe('')
        expect(mermaid.render).not.toHaveBeenCalled()
    })

    it('styles only clickable message labels and stores navigation metadata', async () => {
        vi.mocked(generateSequenceMermaid).mockReturnValue({
            mermaidContent: 'sequenceDiagram\n  A->>B: hello\n  A->>B: plain text',
            idToUuid: { A: 'uuid-a', B: 'uuid-b' },
            messageLabelToUuid: { hello: 'fn-uuid' },
            messageLabelToInterfaceUuid: { hello: 'iface-uuid' },
            messageLinks: [
                {
                    kind: 'functionRef',
                    renderedLabel: 'hello',
                    targetUuid: 'fn-uuid',
                    interfaceUuid: 'iface-uuid',
                    clickable: true,
                },
                { kind: 'label', renderedLabel: 'plain text', clickable: false },
            ],
        })

        const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))
        act(() => {
            result.current.elementRef.current = createSvgContainer(`
        <text class="messageText">hello</text>
        <text class="messageText">plain text</text>
      `)
        })

        await waitFor(() => expect(result.current.svg).toBe('<svg>seq</svg>'))

        const labels =
            result.current.elementRef.current?.querySelectorAll<SVGTextElement>('text.messageText')
        expect(labels).toHaveLength(2)
        expect(labels?.[0].style.cursor).toBe('pointer')
        expect(labels?.[0].style.textDecoration).toBe('underline')
        expect(labels?.[0].getAttribute('data-integra-target-uuid')).toBe('fn-uuid')
        expect(labels?.[0].getAttribute('data-integra-interface-uuid')).toBe('iface-uuid')
        expect(labels?.[1].style.cursor).toBe('')
        expect(labels?.[1].style.textDecoration).toBe('')
        expect(labels?.[1].getAttribute('data-integra-target-uuid')).toBeNull()
    })

    it('clicks a clickable message label using bound SVG metadata', async () => {
        vi.mocked(generateSequenceMermaid).mockReturnValue({
            mermaidContent: 'sequenceDiagram\n  A->>B: checkout',
            idToUuid: { A: 'uuid-a', B: 'uuid-b' },
            messageLabelToUuid: { checkout: 'use-case-uuid' },
            messageLabelToInterfaceUuid: {},
            messageLinks: [
                {
                    kind: 'useCaseRef',
                    renderedLabel: 'checkout',
                    targetUuid: 'use-case-uuid',
                    clickable: true,
                },
            ],
        })

        const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))
        act(() => {
            result.current.elementRef.current = createSvgContainer(
                '<text class="messageText">checkout</text>'
            )
        })

        await waitFor(() => expect(result.current.svg).toBe('<svg>seq</svg>'))

        const label = result.current.elementRef.current?.querySelector('text.messageText')
        expect(label?.getAttribute('data-integra-target-uuid')).toBe('use-case-uuid')

        act(() => {
            result.current.handleSequenceClick({
                target: label,
            } as unknown as React.MouseEvent<HTMLDivElement>)
        })

        expect(mockSelectNode).toHaveBeenCalledWith('use-case-uuid')
        expect(mockSelectInterface).not.toHaveBeenCalled()
    })

    it('does nothing when clicking a plain-text message label', async () => {
        vi.mocked(generateSequenceMermaid).mockReturnValue({
            mermaidContent: 'sequenceDiagram\n  A->>B: plain text',
            idToUuid: { A: 'uuid-a', B: 'uuid-b' },
            messageLabelToUuid: {},
            messageLabelToInterfaceUuid: {},
            messageLinks: [{ kind: 'label', renderedLabel: 'plain text', clickable: false }],
        })

        const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))
        act(() => {
            result.current.elementRef.current = createSvgContainer(
                '<text class="messageText">plain text</text>'
            )
        })

        await waitFor(() => expect(result.current.svg).toBe('<svg>seq</svg>'))

        const label = result.current.elementRef.current?.querySelector('text.messageText')
        act(() => {
            result.current.handleSequenceClick({
                target: label,
            } as unknown as React.MouseEvent<HTMLDivElement>)
        })

        expect(mockSelectNode).not.toHaveBeenCalled()
        expect(mockSelectInterface).not.toHaveBeenCalled()
    })
})
