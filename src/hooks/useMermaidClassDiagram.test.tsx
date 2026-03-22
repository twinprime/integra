// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, renderHook, waitFor, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memo, useMemo, type MouseEventHandler, type RefObject } from 'react'
import { useMermaidClassDiagram } from './useMermaidClassDiagram'
import type { ComponentNode } from '../store/types'
import type { SystemState } from '../store/useSystemStore'
import type { RenderResult } from 'mermaid'
import type {
    ClassDiagramBuildResult,
    ClassDiagramRelationshipMetadata,
    SequenceDiagramSource,
} from '../utils/classDiagramMetadata'

vi.mock('mermaid', () => ({
    default: {
        initialize: vi.fn(),
        render: vi.fn().mockResolvedValue({ svg: '<svg>class</svg>', bindFunctions: undefined }),
    },
}))

vi.mock('../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

import mermaid from 'mermaid'
import { useSystemStore } from '../store/useSystemStore'

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

const mockNode: ComponentNode = {
    uuid: 'comp-uuid',
    id: 'comp',
    name: 'MyComp',
    type: 'component',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

const defaultBuildResult: ClassDiagramBuildResult = {
    mermaidContent: 'classDiagram\n  class Foo',
    idToUuid: { Foo: 'uuid-foo' },
    relationshipMetadata: [],
}

function makeGraphBuildResult(): ClassDiagramBuildResult {
    const compA: ComponentNode = {
        ...mockNode,
        id: 'A',
        uuid: 'uuid-a',
        name: 'A',
        interfaces: [
            {
                uuid: 'iface-a-uuid',
                id: 'IA',
                name: 'IA',
                type: 'rest',
                functions: [{ uuid: 'fn-a-uuid', id: 'handle', parameters: [] }],
            },
        ],
    }
    return {
        mermaidContent: '',
        idToUuid: { A: 'uuid-a', B: 'uuid-b', C: 'uuid-c' },
        relationshipMetadata: [],
        graph: {
            nodes: [
                { kind: 'component', nodeId: 'A', uuid: 'uuid-a', name: 'A' },
                { kind: 'component', nodeId: 'B', uuid: 'uuid-b', name: 'B' },
                { kind: 'component', nodeId: 'C', uuid: 'uuid-c', name: 'C' },
                {
                    kind: 'interface',
                    nodeId: 'iface_iface_a_uuid',
                    name: 'IA',
                    iface: compA.interfaces[0],
                    ownerComponent: compA,
                    calledFunctionIds: ['handle'],
                },
            ],
            edges: [
                {
                    kind: 'implementation',
                    fromNodeId: 'A',
                    toNodeId: 'iface_iface_a_uuid',
                    metadata: {
                        kind: 'implementation',
                        sourceName: 'A',
                        targetName: 'IA',
                        sequenceDiagrams: [],
                    },
                },
                {
                    kind: 'dependency',
                    fromNodeId: 'B',
                    toNodeId: 'iface_iface_a_uuid',
                    metadata: makeDependencyRelationship([
                        { uuid: 'seq-1', name: 'Checkout Flow' },
                    ]),
                },
            ],
            idToUuid: { A: 'uuid-a', B: 'uuid-b', C: 'uuid-c' },
            focusableNodeIds: ['A', 'B', 'C'],
        },
    }
}

function makeDependencyRelationship(
    sequenceDiagrams: SequenceDiagramSource[]
): ClassDiagramRelationshipMetadata {
    return {
        kind: 'dependency',
        sourceName: 'Source',
        targetName: 'Target',
        sequenceDiagrams,
    }
}

const mockBuildFn = vi.fn()

const HookHarnessCanvas = memo(function HookHarnessCanvas({
    svg,
    elementRef,
    handleDiagramClick,
    handleDiagramMouseMove,
    handleDiagramMouseLeave,
}: {
    svg: string
    elementRef: RefObject<HTMLDivElement | null>
    handleDiagramClick: MouseEventHandler<HTMLDivElement>
    handleDiagramMouseMove: MouseEventHandler<HTMLDivElement>
    handleDiagramMouseLeave: () => void
}) {
    return (
        <div
            ref={elementRef}
            data-testid="diagram"
            dangerouslySetInnerHTML={{ __html: svg }}
            onClick={handleDiagramClick}
            onMouseMove={handleDiagramMouseMove}
            onMouseLeave={handleDiagramMouseLeave}
        />
    )
})

function HookHarness({
    buildResult = defaultBuildResult,
}: {
    buildResult?: ClassDiagramBuildResult
}) {
    const buildFn = useMemo(() => vi.fn().mockReturnValue(buildResult), [buildResult])
    const {
        svg,
        elementRef,
        handleDiagramClick,
        handleDiagramMouseMove,
        handleDiagramMouseLeave,
        activeSequenceDiagrams,
        activePopupPosition,
        isPopupPinned,
        clearActiveSequenceDiagrams,
        selectSequenceDiagram,
        handlePopupMouseEnter,
        handlePopupMouseLeave,
    } = useMermaidClassDiagram(buildFn, mockNode, 'test')

    return (
        <div>
            <HookHarnessCanvas
                svg={svg}
                elementRef={elementRef}
                handleDiagramClick={handleDiagramClick}
                handleDiagramMouseMove={handleDiagramMouseMove}
                handleDiagramMouseLeave={handleDiagramMouseLeave}
            />
            <button type="button" onClick={clearActiveSequenceDiagrams}>
                clear
            </button>
            <button type="button" onClick={() => selectSequenceDiagram('seq-1')}>
                select-seq
            </button>
            <div data-testid="active-count">{activeSequenceDiagrams.length}</div>
            <div data-testid="popup-pinned">{String(isPopupPinned)}</div>
            <div data-testid="popup-position">
                {activePopupPosition ? `${activePopupPosition.x},${activePopupPosition.y}` : 'none'}
            </div>
            <button type="button" onClick={handlePopupMouseEnter}>
                popup-enter
            </button>
            <button type="button" onClick={handlePopupMouseLeave}>
                popup-leave
            </button>
            {activeSequenceDiagrams.map((diagram) => (
                <div key={diagram.uuid}>{diagram.name}</div>
            ))}
        </div>
    )
}

describe('useMermaidClassDiagram', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
            selector({
                rootComponent: mockRootComponent,
                selectNode: mockSelectNode,
            } as unknown as SystemState)
        )
        vi.mocked(mermaid.render).mockResolvedValue({
            svg: '<svg>class</svg>',
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)
        mockBuildFn.mockReturnValue(defaultBuildResult)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns SVG on successful render', async () => {
        const { result } = renderHook(() => useMermaidClassDiagram(mockBuildFn, mockNode, 'test'))

        await waitFor(() => expect(result.current.svg).toBe('<svg>class</svg>'))
        expect(result.current.error).toBe('')
    })

    it('calls buildFn with node and rootComponent', async () => {
        const { result } = renderHook(() => useMermaidClassDiagram(mockBuildFn, mockNode, 'test'))

        await waitFor(() => expect(result.current.svg).toBe('<svg>class</svg>'))
        expect(mockBuildFn).toHaveBeenCalledWith(mockNode, mockRootComponent)
    })

    it('passes idPrefix to mermaid.render element id', async () => {
        const { result } = renderHook(() =>
            useMermaidClassDiagram(mockBuildFn, mockNode, 'comp-class')
        )

        await waitFor(() => expect(result.current.svg).toBe('<svg>class</svg>'))
        expect(mermaid.render).toHaveBeenCalledWith(
            expect.stringMatching(/^mermaid-comp-class-\d+$/),
            expect.any(String)
        )
    })

    it('re-renders when the selected node changes', async () => {
        const firstNode = { ...mockNode, uuid: 'node-a-uuid', id: 'nodeA', name: 'Node A' }
        const secondNode = { ...mockNode, uuid: 'node-b-uuid', id: 'nodeB', name: 'Node B' }
        const buildFn = vi
            .fn()
            .mockReturnValueOnce({
                mermaidContent: 'classDiagram\n  class NodeA',
                idToUuid: { NodeA: 'node-a-uuid' },
                relationshipMetadata: [],
            })
            .mockReturnValueOnce({
                mermaidContent: 'classDiagram\n  class NodeB',
                idToUuid: { NodeB: 'node-b-uuid' },
                relationshipMetadata: [],
            })

        const { rerender } = renderHook(
            ({ node }) => useMermaidClassDiagram(buildFn, node, 'test'),
            { initialProps: { node: firstNode } }
        )

        await waitFor(() =>
            expect(vi.mocked(mermaid.render)).toHaveBeenLastCalledWith(
                expect.any(String),
                'classDiagram\n  class NodeA'
            )
        )

        rerender({ node: secondNode })

        await waitFor(() =>
            expect(vi.mocked(mermaid.render)).toHaveBeenLastCalledWith(
                expect.any(String),
                'classDiagram\n  class NodeB'
            )
        )
    })

    it('re-renders when the build function changes', async () => {
        const firstBuildFn = vi.fn().mockReturnValue({
            mermaidContent: 'classDiagram\n  class WithInterfaces',
            idToUuid: { WithInterfaces: 'with-interfaces-uuid' },
            relationshipMetadata: [],
        })
        const secondBuildFn = vi.fn().mockReturnValue({
            mermaidContent: 'classDiagram\n  class WithoutInterfaces',
            idToUuid: { WithoutInterfaces: 'without-interfaces-uuid' },
            relationshipMetadata: [],
        })

        const { rerender } = renderHook(
            ({ buildFn }) => useMermaidClassDiagram(buildFn, mockNode, 'test'),
            { initialProps: { buildFn: firstBuildFn } }
        )

        await waitFor(() =>
            expect(vi.mocked(mermaid.render)).toHaveBeenLastCalledWith(
                expect.any(String),
                'classDiagram\n  class WithInterfaces'
            )
        )

        rerender({ buildFn: secondBuildFn })

        await waitFor(() =>
            expect(vi.mocked(mermaid.render)).toHaveBeenLastCalledWith(
                expect.any(String),
                'classDiagram\n  class WithoutInterfaces'
            )
        )
    })

    it('returns error when mermaid.render throws', async () => {
        vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('Syntax error in diagram'))

        const { result } = renderHook(() => useMermaidClassDiagram(mockBuildFn, mockNode, 'test'))

        await waitFor(() => expect(result.current.error).toBe('Syntax error in diagram'))
        expect(result.current.svg).toBe('')
    })

    it('returns empty state when node is null', async () => {
        const { result } = renderHook(() => useMermaidClassDiagram(mockBuildFn, null, 'test'))

        await new Promise((r) => setTimeout(r, 20))

        expect(mermaid.render).not.toHaveBeenCalled()
        expect(result.current.svg).toBe('')
        expect(result.current.error).toBe('')
    })

    it('returns empty state when buildFn returns no mermaidContent', async () => {
        mockBuildFn.mockReturnValueOnce({
            mermaidContent: '',
            idToUuid: {},
            relationshipMetadata: [],
        })

        const { result } = renderHook(() => useMermaidClassDiagram(mockBuildFn, mockNode, 'test'))

        await new Promise((r) => setTimeout(r, 20))

        expect(mermaid.render).not.toHaveBeenCalled()
        expect(result.current.svg).toBe('')
    })

    it('exposes elementRef in the return value', () => {
        const { result } = renderHook(() => useMermaidClassDiagram(mockBuildFn, null, 'test'))

        expect(result.current.elementRef).toBeDefined()
        expect(result.current.elementRef.current).toBeNull()
    })

    it('wires __integraNavigate to call selectNode with mapped uuid', async () => {
        mockBuildFn.mockReturnValue({
            mermaidContent: 'classDiagram\n  class A',
            idToUuid: { A: 'uuid-a' },
            relationshipMetadata: [],
        })

        const { result } = renderHook(() => useMermaidClassDiagram(mockBuildFn, mockNode, 'test'))

        await waitFor(() => expect(result.current.svg).toBe('<svg>class</svg>'))

        globalThis.__integraNavigate?.('A')
        expect(mockSelectNode).toHaveBeenCalledWith('uuid-a')
    })

    it('uses single click to focus and filter graph-backed diagrams', async () => {
        const graphBuildResult = makeGraphBuildResult()
        render(<HookHarness buildResult={graphBuildResult} />)

        await waitFor(() => expect(screen.getByTestId('diagram')).toBeInTheDocument())
        vi.useFakeTimers()

        globalThis.__integraNavigate?.('B')
        await act(async () => {
            await vi.advanceTimersByTimeAsync(250)
        })

        expect(vi.mocked(mermaid.render)).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.not.stringContaining('class C["C"]')
        )
        expect(vi.mocked(mermaid.render)).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.stringContaining('class A["A"]')
        )
        expect(vi.mocked(mermaid.render)).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.stringContaining('class iface_iface_a_uuid["IA"]')
        )
        expect(vi.mocked(mermaid.render)).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.stringContaining('class B["B"]')
        )
        expect(mockSelectNode).not.toHaveBeenCalled()
    })

    it('uses double click to navigate graph-backed diagrams', async () => {
        const graphBuildResult = makeGraphBuildResult()
        render(<HookHarness buildResult={graphBuildResult} />)

        await waitFor(() => expect(screen.getByTestId('diagram')).toBeInTheDocument())
        vi.useFakeTimers()

        globalThis.__integraNavigate?.('A')
        globalThis.__integraNavigate?.('A')
        await act(async () => {
            await vi.advanceTimersByTimeAsync(250)
        })

        expect(mockSelectNode).toHaveBeenCalledWith('uuid-a')
    })

    it('annotates clickable dependency edges after render', async () => {
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
            <path data-edge="true" data-id="edge-1"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Uses</div></foreignObject></g></g>
            <g class="edgeLabel"><g class="label" data-id="edge-1"><foreignObject><div>Owns</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..> B\n  B ..|> C',
                    idToUuid: {},
                    relationshipMetadata: [
                        makeDependencyRelationship([{ uuid: 'seq-1', name: 'Checkout Flow' }]),
                        null,
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-index="0"]')
            ).not.toBeNull()
        })

        expect(
            screen.getByTestId('diagram').querySelector('[data-integra-edge-index="1"]')
        ).toBeNull()
        expect(
            screen.getByTestId('diagram').querySelector('[data-integra-edge-hit-target="true"]')
        ).not.toBeNull()
    })

    it('annotates implementation edges and pins their popup on click', async () => {
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Implements</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..|> B',
                    idToUuid: {},
                    relationshipMetadata: [
                        {
                            kind: 'implementation',
                            sourceName: 'AuthService',
                            targetName: 'IAuth',
                            sequenceDiagrams: [],
                        } as ClassDiagramBuildResult['relationshipMetadata'][number],
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-index="0"]')
            ).not.toBeNull()
        })

        const hitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(hitTarget).not.toBeNull()

        fireEvent.click(hitTarget!, { clientX: 120, clientY: 140 })

        expect(screen.getByTestId('popup-pinned')).toHaveTextContent('true')
        expect(mockSelectNode).not.toHaveBeenCalled()
    })

    it('shows dependency sources on hover', async () => {
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Uses</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..> B',
                    idToUuid: {},
                    relationshipMetadata: [
                        makeDependencyRelationship([{ uuid: 'seq-1', name: 'Checkout Flow' }]),
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-index="0"]')
            ).not.toBeNull()
        })

        const hitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(hitTarget).not.toBeNull()
        fireEvent.mouseMove(hitTarget!, { clientX: 120, clientY: 140 })
        expect(screen.getByText('Checkout Flow')).toBeInTheDocument()
        expect(screen.getByTestId('active-count')).toHaveTextContent('1')
        expect(screen.getByTestId('popup-pinned')).toHaveTextContent('false')
        expect(screen.getByTestId('popup-position')).toHaveTextContent('120,140')
    })

    it('clears hover popup after leaving the diagram', async () => {
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Uses</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..> B',
                    idToUuid: {},
                    relationshipMetadata: [
                        makeDependencyRelationship([{ uuid: 'seq-1', name: 'Checkout Flow' }]),
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(screen.getByText('Uses')).toBeInTheDocument()
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-hit-target="true"]')
            ).not.toBeNull()
        })

        const hitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(hitTarget).not.toBeNull()
        fireEvent.mouseMove(hitTarget!, { clientX: 120, clientY: 140 })
        expect(screen.getByTestId('active-count')).toHaveTextContent('1')

        fireEvent.mouseLeave(screen.getByTestId('diagram'))
        await waitFor(() => expect(screen.getByTestId('active-count')).toHaveTextContent('0'))
    })

    it('keeps hover popup open while the popup is hovered', async () => {
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Uses</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..> B',
                    idToUuid: {},
                    relationshipMetadata: [
                        makeDependencyRelationship([{ uuid: 'seq-1', name: 'Checkout Flow' }]),
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(screen.getByText('Uses')).toBeInTheDocument()
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-hit-target="true"]')
            ).not.toBeNull()
        })

        const hitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(hitTarget).not.toBeNull()
        fireEvent.mouseMove(hitTarget!, { clientX: 120, clientY: 140 })
        fireEvent.click(screen.getByText('popup-enter'))
        fireEvent.mouseLeave(screen.getByTestId('diagram'))
        expect(screen.getByTestId('active-count')).toHaveTextContent('1')

        fireEvent.click(screen.getByText('popup-leave'))
        await waitFor(() => expect(screen.getByTestId('active-count')).toHaveTextContent('0'))
    })

    it('navigates directly when a dependency has one source diagram', async () => {
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Uses</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..> B',
                    idToUuid: {},
                    relationshipMetadata: [
                        makeDependencyRelationship([{ uuid: 'seq-1', name: 'Checkout Flow' }]),
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(screen.getByText('Uses')).toBeInTheDocument()
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-hit-target="true"]')
            ).not.toBeNull()
        })

        const hitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(hitTarget).not.toBeNull()
        fireEvent.click(hitTarget!, { clientX: 120, clientY: 140 })
        expect(mockSelectNode).toHaveBeenCalledWith('seq-1')
        expect(screen.getByTestId('active-count')).toHaveTextContent('0')
    })

    it('pins the popup on click when a dependency has multiple source diagrams', async () => {
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Uses</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..> B',
                    idToUuid: {},
                    relationshipMetadata: [
                        makeDependencyRelationship([
                            { uuid: 'seq-1', name: 'Checkout Flow' },
                            { uuid: 'seq-2', name: 'Retry Flow' },
                        ]),
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(screen.getByText('Uses')).toBeInTheDocument()
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-hit-target="true"]')
            ).not.toBeNull()
        })

        const hitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(hitTarget).not.toBeNull()
        fireEvent.click(hitTarget!, { clientX: 120, clientY: 140 })
        expect(screen.getByTestId('active-count')).toHaveTextContent('2')
        expect(screen.getByTestId('popup-pinned')).toHaveTextContent('true')
    })

    it('keeps a click-pinned multi-source popup pinned while the pointer moves away from the edge', async () => {
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Uses</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..> B',
                    idToUuid: {},
                    relationshipMetadata: [
                        makeDependencyRelationship([
                            { uuid: 'seq-1', name: 'Checkout Flow' },
                            { uuid: 'seq-2', name: 'Retry Flow' },
                        ]),
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(screen.getByText('Uses')).toBeInTheDocument()
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-hit-target="true"]')
            ).not.toBeNull()
        })

        const hitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(hitTarget).not.toBeNull()

        fireEvent.click(hitTarget!, { clientX: 120, clientY: 140 })
        expect(screen.getByTestId('popup-pinned')).toHaveTextContent('true')

        fireEvent.mouseMove(hitTarget!, { clientX: 121, clientY: 141 })
        fireEvent.mouseLeave(screen.getByTestId('diagram'))

        expect(screen.getByTestId('active-count')).toHaveTextContent('2')
        expect(screen.getByTestId('popup-pinned')).toHaveTextContent('true')
        expect(screen.getByText('Checkout Flow')).toBeInTheDocument()
        expect(screen.getByText('Retry Flow')).toBeInTheDocument()
    })

    it('keeps dependency links clickable after closing the popup', async () => {
        const user = userEvent.setup()
        vi.mocked(mermaid.render).mockResolvedValueOnce({
            svg: `
        <svg>
          <g class="edgePaths">
            <path data-edge="true" data-id="edge-0"></path>
          </g>
          <g class="edgeLabels">
            <g class="edgeLabel"><g class="label" data-id="edge-0"><foreignObject><div>Uses</div></foreignObject></g></g>
          </g>
        </svg>
      `,
            diagramType: 'classDiagram',
            bindFunctions: undefined,
        } satisfies RenderResult)

        render(
            <HookHarness
                buildResult={{
                    mermaidContent: 'classDiagram\n  A ..> B',
                    idToUuid: {},
                    relationshipMetadata: [
                        makeDependencyRelationship([
                            { uuid: 'seq-1', name: 'Checkout Flow' },
                            { uuid: 'seq-2', name: 'Retry Flow' },
                        ]),
                    ],
                }}
            />
        )

        await waitFor(() => {
            expect(screen.getByText('Uses')).toBeInTheDocument()
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-hit-target="true"]')
            ).not.toBeNull()
        })

        const hitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(hitTarget).not.toBeNull()

        fireEvent.click(hitTarget!)
        expect(screen.getByText('Checkout Flow')).toBeInTheDocument()
        expect(screen.getByText('Retry Flow')).toBeInTheDocument()

        await user.click(screen.getByText('clear'))
        expect(screen.getByTestId('active-count')).toHaveTextContent('0')

        await waitFor(() => {
            expect(
                screen.getByTestId('diagram').querySelector('[data-integra-edge-hit-target="true"]')
            ).not.toBeNull()
        })

        const reopenedHitTarget = screen
            .getByTestId('diagram')
            .querySelector('[data-integra-edge-hit-target="true"]')
        expect(reopenedHitTarget).not.toBeNull()

        fireEvent.click(reopenedHitTarget!)
        expect(screen.getByTestId('active-count')).toHaveTextContent('2')
        expect(screen.getByText('Checkout Flow')).toBeInTheDocument()
    })

    it('navigates to the selected sequence diagram', async () => {
        const user = userEvent.setup()
        render(<HookHarness />)

        await waitFor(() => expect(screen.getByTestId('diagram')).toBeInTheDocument())

        await user.click(screen.getByText('select-seq'))
        expect(mockSelectNode).toHaveBeenCalledWith('seq-1')
    })
})
