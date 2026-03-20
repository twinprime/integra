import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentNode } from '../../store/types'
import { TreeNode } from './TreeNode'
import type { SystemState } from '../../store/useSystemStore'

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
})
