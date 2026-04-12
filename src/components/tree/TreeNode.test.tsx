import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentNode } from '../../store/types'
import { TreeNode } from './TreeNode'
import type { SystemState } from '../../store/useSystemStore'
import { isNodeOrphaned } from '../../utils/nodeUtils'

vi.mock('../../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

vi.mock('../../utils/nodeUtils', () => ({
    isNodeOrphaned: vi.fn(() => false),
}))

vi.mock('../../nodes/nodeTree', async () => {
    const actual =
        await vi.importActual<typeof import('../../nodes/nodeTree')>('../../nodes/nodeTree')
    return {
        ...actual,
        getNodeHandler: vi.fn(() => ({ orphanWhenUnreferenced: false })),
    }
})

vi.mock('./NodeIcon', () => ({
    NodeIcon: () => <span data-testid="node-icon" />,
}))

vi.mock('@dnd-kit/core', () => ({
    DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    closestCenter: {},
    PointerSensor: class {},
    useSensor: () => ({}),
    useSensors: () => [],
}))

vi.mock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    verticalListSortingStrategy: {},
    useSortable: () => ({
        attributes: { 'data-sortable-row': 'true' },
        listeners: {},
        setNodeRef: () => {},
        transform: { x: 10, y: 0, scaleX: 1, scaleY: 1 },
        transition: 'transform 200ms ease',
        isDragging: false,
    }),
}))

vi.mock('@dnd-kit/utilities', () => ({
    CSS: {
        Transform: {
            toString: () => 'translate3d(10px, 0px, 0)',
        },
    },
}))

import { useSystemStore } from '../../store/useSystemStore'

const mockState = {
    selectedNodeId: null,
    selectNode: vi.fn(),
    deleteNode: vi.fn(),
    reorderNode: vi.fn(),
}

function makeComponentNode(): ComponentNode {
    return {
        uuid: 'root-uuid',
        id: 'root',
        name: 'Root Component',
        type: 'component',
        description: '<!-- TODO Review root roadmap -->',
        subComponents: [
            {
                uuid: 'child-uuid',
                id: 'child',
                name: 'Child Component',
                type: 'component',
                description: '<!-- TODO Validate child contract -->',
                subComponents: [],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            },
        ],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.mocked(useSystemStore).mockImplementation((selector: (state: SystemState) => unknown) =>
        selector({
            ...mockState,
            rootComponent: makeComponentNode(),
        } as unknown as SystemState)
    )
})

describe('TreeNode', () => {
    it('keeps expanded child content outside the transformed draggable row', () => {
        render(<TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} />)

        const transformedRow = document.querySelector('[style*="translate3d"]')
        expect(transformedRow).not.toBeNull()
        expect(
            within(transformedRow as HTMLElement).getByText('Root Component')
        ).toBeInTheDocument()
        expect(
            within(transformedRow as HTMLElement).queryByText('Child Component')
        ).not.toBeInTheDocument()

        expect(screen.getByText('Child Component')).toBeInTheDocument()
    })

    it('shows a TODO icon when the node subtree has TODOs', () => {
        render(<TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} />)

        expect(screen.getByLabelText('Show TODOs for Root Component')).toBeInTheDocument()
    })

    it('opens the TODO popup and selects the defining node when a TODO is clicked', async () => {
        const user = userEvent.setup()

        render(<TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} />)

        await user.click(screen.getByLabelText('Show TODOs for Root Component'))

        expect(screen.getByText('Review root roadmap')).toBeInTheDocument()
        expect(screen.getByText('Validate child contract')).toBeInTheDocument()
        expect(screen.getAllByText('Child Component')[0]).toBeInTheDocument()

        await user.click(screen.getByText('Validate child contract'))

        expect(mockState.selectNode).toHaveBeenCalledWith('child-uuid')
    })

    it('hides the TODO icon when the subtree has no TODOs', () => {
        const rootWithoutTodos: ComponentNode = {
            ...makeComponentNode(),
            description: '',
            subComponents: [{ ...makeComponentNode().subComponents[0], description: '' }],
        }

        vi.mocked(useSystemStore).mockImplementation((selector: (state: SystemState) => unknown) =>
            selector({
                ...mockState,
                rootComponent: rootWithoutTodos,
            } as unknown as SystemState)
        )

        render(<TreeNode node={rootWithoutTodos} onContextMenu={vi.fn()} />)

        expect(screen.queryByLabelText('Show TODOs for Root Component')).not.toBeInTheDocument()
    })

    it('starts descendant nodes collapsed by default', () => {
        render(<TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} depth={1} />)

        expect(screen.getByText('Root Component')).toBeInTheDocument()
        expect(screen.queryByText('Child Component')).not.toBeInTheDocument()
    })

    it('keeps branch expanded after navigation moves away from a child node', () => {
        // Start with a child node selected — this auto-expands the parent branch
        vi.mocked(useSystemStore).mockImplementation((selector: (state: SystemState) => unknown) =>
            selector({
                ...mockState,
                selectedNodeId: 'child-uuid',
                rootComponent: makeComponentNode(),
            } as unknown as SystemState)
        )

        const { rerender } = render(
            <TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} depth={1} />
        )

        // Child is visible because the branch was auto-expanded
        expect(screen.getByText('Child Component')).toBeInTheDocument()

        // Now navigate away — select a node that is NOT in this branch
        vi.mocked(useSystemStore).mockImplementation((selector: (state: SystemState) => unknown) =>
            selector({
                ...mockState,
                selectedNodeId: 'other-uuid',
                rootComponent: makeComponentNode(),
            } as unknown as SystemState)
        )

        rerender(<TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} depth={1} />)

        // Branch should still be expanded — child must still be visible
        expect(screen.getByText('Child Component')).toBeInTheDocument()
    })

    it('allows manually collapsing a branch that was previously auto-expanded', async () => {
        const user = userEvent.setup()

        // Start with a child node selected — auto-expands the parent branch
        vi.mocked(useSystemStore).mockImplementation((selector: (state: SystemState) => unknown) =>
            selector({
                ...mockState,
                selectedNodeId: 'child-uuid',
                rootComponent: makeComponentNode(),
            } as unknown as SystemState)
        )

        const { rerender } = render(
            <TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} depth={1} />
        )

        // Navigate away — branch stays open due to fix
        vi.mocked(useSystemStore).mockImplementation((selector: (state: SystemState) => unknown) =>
            selector({
                ...mockState,
                selectedNodeId: 'other-uuid',
                rootComponent: makeComponentNode(),
            } as unknown as SystemState)
        )
        rerender(<TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} depth={1} />)
        expect(screen.getByText('Child Component')).toBeInTheDocument()

        // User manually collapses the branch
        await user.click(screen.getByLabelText('Collapse'))
        expect(screen.queryByText('Child Component')).not.toBeInTheDocument()
    })

    it('suppresses mutation affordances in read-only mode', async () => {
        const user = userEvent.setup()
        const onContextMenu = vi.fn()
        vi.mocked(isNodeOrphaned).mockReturnValue(true)

        render(
            <TreeNode node={makeComponentNode()} onContextMenu={onContextMenu} readOnly={true} />
        )

        const row = screen.getByText('Root Component').closest('[role="treeitem"]')
        expect(row).not.toBeNull()
        await user.pointer([{ target: row as HTMLElement, keys: '[MouseRight]' }])

        expect(onContextMenu).not.toHaveBeenCalled()
        expect(screen.queryByTitle('Drag to reorder')).not.toBeInTheDocument()
        expect(screen.queryByTitle('Delete "Root Component"')).not.toBeInTheDocument()
    })
})
