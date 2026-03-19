// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemState } from '../store/useSystemStore'

vi.mock('../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

vi.mock('./diagrams/UseCaseDiagram', () => ({
    UseCaseDiagram: ({ toolbarContent }: { toolbarContent?: ReactNode }) => (
        <div>
            <div>Use Case Diagram View</div>
            {toolbarContent}
        </div>
    ),
}))

vi.mock('./diagrams/UseCaseDiagramClassDiagram', () => ({
    UseCaseDiagramClassDiagram: ({ toolbarContent }: { toolbarContent?: ReactNode }) => (
        <div>
            <div>Use Case Diagram Class View</div>
            {toolbarContent}
        </div>
    ),
}))

vi.mock('./diagrams/SequenceDiagram', () => ({
    SequenceDiagram: () => <div>Sequence Diagram View</div>,
}))

vi.mock('./diagrams/UseCaseClassDiagram', () => ({
    UseCaseClassDiagram: () => <div>Use Case Class Diagram View</div>,
}))

vi.mock('./diagrams/ComponentClassDiagram', () => ({
    ComponentClassDiagram: () => <div>Component Class Diagram View</div>,
}))

import { useSystemStore } from '../store/useSystemStore'
import { DiagramPanel } from './DiagramPanel'

const selectVisualizationView = vi.fn()

const rootComponent = {
    uuid: 'root-uuid',
    id: 'root',
    name: 'Root',
    type: 'component' as const,
    subComponents: [
        {
            uuid: 'comp-uuid',
            id: 'comp',
            name: 'Component',
            type: 'component' as const,
            subComponents: [],
            actors: [],
            useCaseDiagrams: [
                {
                    uuid: 'ucd-uuid',
                    id: 'ucd',
                    name: 'Use Cases',
                    type: 'use-case-diagram' as const,
                    content: '',
                    description: '',
                    ownerComponentUuid: 'comp-uuid',
                    referencedNodeIds: [],
                    useCases: [],
                },
            ],
            interfaces: [],
        },
    ],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

describe('DiagramPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    function mockStore(activeVisualizationViewId: string | null) {
        vi.mocked(useSystemStore).mockImplementation((selector: (state: SystemState) => unknown) =>
            selector({
                selectedNodeId: 'ucd-uuid',
                activeVisualizationViewId,
                selectVisualizationView,
                rootComponent,
            } as unknown as SystemState)
        )
    }

    it('shows generic visualization controls for node types with multiple views', () => {
        mockStore(null)
        render(<DiagramPanel />)

        expect(screen.getByText('Use Case Diagram View')).toBeInTheDocument()
        expect(screen.getByTestId('visualization-view-controls')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Diagram' })).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(screen.getByRole('button', { name: 'Class Diagram' })).toHaveAttribute(
            'aria-pressed',
            'false'
        )
    })

    it('renders the selected visualization view and routes button clicks through the store', async () => {
        const user = userEvent.setup()
        mockStore('class-diagram')
        render(<DiagramPanel />)

        expect(screen.getByText('Use Case Diagram Class View')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Diagram' }))
        expect(selectVisualizationView).toHaveBeenCalledWith('diagram')
    })
})
