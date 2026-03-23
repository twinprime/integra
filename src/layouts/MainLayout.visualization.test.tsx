// @vitest-environment jsdom
import { type PropsWithChildren } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSystemStore } from '../store/useSystemStore'
import { MainLayout } from './MainLayout'

type PanelHandle = {
    resize: (size?: number) => void
    collapse: () => void
    expand: () => void
}

const mockPanelHandles: Array<
    PanelHandle & {
        defaultSize?: number
    }
> = []

vi.mock('lucide-react', () => ({
    ChevronLeft: () => <span>left</span>,
    ChevronRight: () => <span>right</span>,
    ChevronUp: () => <span>up</span>,
    ChevronDown: () => <span>down</span>,
}))

vi.mock('react-resizable-panels', async () => {
    const React = await vi.importActual<typeof import('react')>('react')
    const { forwardRef, useImperativeHandle, useMemo, useState } = React

    const Panel = forwardRef(function MockPanel(
        { children, defaultSize }: PropsWithChildren<{ defaultSize?: number }>,
        ref: React.ForwardedRef<PanelHandle>
    ) {
        const [isCollapsed, setIsCollapsed] = useState(false)
        const [size, setSize] = useState<number | undefined>(defaultSize)
        const handle = useMemo(
            () => ({
                defaultSize,
                resize: vi.fn((nextSize?: number) => {
                    setIsCollapsed(false)
                    if (nextSize != null) setSize(nextSize)
                }),
                collapse: vi.fn(() => setIsCollapsed(true)),
                expand: vi.fn(() => setIsCollapsed(false)),
            }),
            [defaultSize]
        )

        mockPanelHandles.push(handle)

        useImperativeHandle(ref, () => handle, [handle])

        return (
            <div
                data-testid="panel"
                data-default-size={defaultSize}
                data-size={size}
                data-collapsed={String(isCollapsed)}
            >
                {children}
            </div>
        )
    })

    return {
        Panel,
        PanelGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
        PanelResizeHandle: ({ children }: PropsWithChildren) => <div>{children}</div>,
    }
})

const useCaseNode = {
    uuid: 'use-case-uuid',
    id: 'placeOrder',
    name: 'Place Order',
    type: 'use-case' as const,
    description: 'Place an order',
    sequenceDiagrams: [],
}

const useCaseDiagramNode = {
    uuid: 'use-case-diagram-uuid',
    id: 'ordering',
    name: 'Ordering',
    type: 'use-case-diagram' as const,
    description: 'Ordering flows',
    content: '',
    referencedNodeIds: [],
    ownerComponentUuid: 'root-uuid',
    useCases: [useCaseNode],
}

const componentNode = {
    uuid: 'component-uuid',
    id: 'orders',
    name: 'Orders',
    type: 'component' as const,
    description: 'Orders component',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [
        {
            uuid: 'interface-uuid',
            id: 'ordersApi',
            name: 'Orders API',
            kind: 'local' as const,
            type: 'rest' as const,
            functions: [],
        },
    ],
}

function makeRootComponent() {
    return {
        uuid: 'root-uuid',
        id: 'root',
        name: 'Root',
        type: 'component' as const,
        description: 'Root component',
        subComponents: [componentNode],
        actors: [],
        useCaseDiagrams: [useCaseDiagramNode],
        interfaces: [],
    }
}

function VisualizationProbe() {
    const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
    if (selectedNodeId === 'component-uuid') {
        throw new Error('Visualization blew up')
    }
    return <div>Visualization ok</div>
}

describe('MainLayout visualization state', () => {
    beforeEach(() => {
        mockPanelHandles.length = 0
        useSystemStore.setState({
            rootComponent: makeRootComponent(),
            selectedNodeId: 'component-uuid',
            uiMode: 'edit',
        })
    })

    it('keeps the bottom panel expanded when switching tree selection', async () => {
        const user = userEvent.setup()

        render(
            <MainLayout
                leftPanel={<div>left</div>}
                rightPanel={<div>editor</div>}
                bottomPanel={<div>visualization</div>}
            />
        )

        const topPanelHandle = mockPanelHandles.find((handle) => handle.defaultSize === 45)
        expect(topPanelHandle).toBeDefined()

        await user.click(screen.getByTitle('Expand bottom panel'))
        await waitFor(() => expect(topPanelHandle?.collapse).toHaveBeenCalledTimes(1))

        const resizeCallsBeforeSelectionChange = vi.mocked(topPanelHandle!.resize).mock.calls.length

        act(() => {
            useSystemStore.setState({ selectedNodeId: 'use-case-diagram-uuid' })
        })

        expect(topPanelHandle?.resize).toHaveBeenCalledTimes(resizeCallsBeforeSelectionChange)
    })

    it('clears visualization errors when switching tree selection', () => {
        render(
            <MainLayout
                leftPanel={<div>left</div>}
                rightPanel={<div>editor</div>}
                bottomPanel={<VisualizationProbe />}
            />
        )

        expect(screen.getByText('Diagram error')).toBeInTheDocument()
        expect(screen.getByText('Visualization blew up')).toBeInTheDocument()

        act(() => {
            useSystemStore.setState({ selectedNodeId: 'use-case-diagram-uuid' })
        })

        expect(screen.queryByText('Diagram error')).not.toBeInTheDocument()
        expect(screen.getByText('Visualization ok')).toBeInTheDocument()
    })
})
