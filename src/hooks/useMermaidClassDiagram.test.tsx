// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, renderHook, waitFor, screen } from '@testing-library/react'
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
