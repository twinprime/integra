// @vitest-environment jsdom
import { type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type {
    ComponentNode,
    InterfaceSpecification,
    UseCaseDiagramNode,
    UseCaseNode,
} from '../store/types'
import { useSystemStore } from '../store/useSystemStore'
import { MainLayout } from './MainLayout'

type PanelHandle = {
    resize: () => void
    collapse: () => void
    expand: () => void
}

vi.mock('lucide-react', () => ({
    ChevronLeft: () => <span>left</span>,
    ChevronRight: () => <span>right</span>,
    ChevronUp: () => <span>up</span>,
    ChevronDown: () => <span>down</span>,
}))

vi.mock('../components/ErrorBoundary', () => ({
    ErrorBoundary: ({ children }: PropsWithChildren) => <>{children}</>,
}))

vi.mock('react-resizable-panels', async () => {
    const React = await vi.importActual<typeof import('react')>('react')
    const { forwardRef, useImperativeHandle, useMemo } = React

    const Panel = forwardRef(function MockPanel(
        { children, defaultSize }: PropsWithChildren<{ defaultSize?: number }>,
        ref: React.ForwardedRef<PanelHandle>
    ) {
        const handle = useMemo<PanelHandle>(
            () => ({
                resize: vi.fn(),
                collapse: vi.fn(),
                expand: vi.fn(),
            }),
            []
        )

        useImperativeHandle(ref, () => handle)

        return (
            <div data-testid="panel" data-default-size={defaultSize}>
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

function makeInterface(): InterfaceSpecification {
    return {
        uuid: 'interface-uuid',
        id: 'ordersApi',
        name: 'Orders API',
        kind: 'local',
        type: 'rest',
        functions: [],
    }
}

const useCaseNode: UseCaseNode = {
    uuid: 'use-case-uuid',
    id: 'placeOrder',
    name: 'Place Order',
    type: 'use-case',
    description: 'Place an order',
    sequenceDiagrams: [],
}

const useCaseDiagramNode: UseCaseDiagramNode = {
    uuid: 'use-case-diagram-uuid',
    id: 'ordering',
    name: 'Ordering',
    type: 'use-case-diagram',
    description: 'Ordering flows',
    content: '',
    referencedNodeIds: [],
    ownerComponentUuid: 'root-uuid',
    useCases: [useCaseNode],
}

const componentNode: ComponentNode = {
    uuid: 'component-uuid',
    id: 'orders',
    name: 'Orders',
    type: 'component',
    description: 'Orders component',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [makeInterface()],
}

function makeRootComponent(): ComponentNode {
    return {
        uuid: 'root-uuid',
        id: 'root',
        name: 'Root',
        type: 'component',
        description: 'Root component',
        subComponents: [componentNode],
        actors: [],
        useCaseDiagrams: [useCaseDiagramNode],
        interfaces: [],
    }
}

describe('MainLayout', () => {
    beforeEach(() => {
        useSystemStore.setState({
            rootComponent: makeRootComponent(),
            selectedNodeId: null,
            uiMode: 'edit',
        })
    })

    it('shrinks the top panel for use-case nodes without a specification editor', () => {
        useSystemStore.setState({ selectedNodeId: 'use-case-uuid' })

        render(
            <MainLayout
                leftPanel={<div>left</div>}
                rightPanel={<div>editor</div>}
                bottomPanel={<div>visualization</div>}
            />
        )

        expect(screen.getAllByTestId('panel')[2]).toHaveAttribute('data-default-size', '30')
    })

    it('keeps more room for component interfaces while letting visualization use the rest', () => {
        useSystemStore.setState({ selectedNodeId: 'component-uuid' })

        render(
            <MainLayout
                leftPanel={<div>left</div>}
                rightPanel={<div>editor</div>}
                bottomPanel={<div>visualization</div>}
            />
        )

        expect(screen.getAllByTestId('panel')[2]).toHaveAttribute('data-default-size', '45')
    })
})
