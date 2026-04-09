// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useSystemStore } from './store/useSystemStore'

vi.mock('./layouts/MainLayout', () => ({
    MainLayout: ({
        leftPanel,
        rightPanel,
        bottomPanel,
    }: {
        leftPanel: React.ReactNode
        rightPanel: React.ReactNode
        bottomPanel: React.ReactNode
    }) => (
        <div>
            <div data-testid="left-panel">{leftPanel}</div>
            <div data-testid="right-panel">{rightPanel}</div>
            <div data-testid="bottom-panel">{bottomPanel}</div>
        </div>
    ),
}))

vi.mock('./components/TreeView', () => ({
    TreeView: () => {
        const selectNode = useSystemStore((state) => state.selectNode)
        return <button onClick={() => selectNode('child-uuid')}>Select child</button>
    },
}))

vi.mock('./components/EditorPanel', () => ({
    EditorPanel: () => {
        const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
        return <div>Editor {selectedNodeId ?? 'none'}</div>
    },
}))

vi.mock('./components/DiagramPanel', () => ({
    DiagramPanel: () => <div>Diagram</div>,
}))

describe('App', () => {
    beforeEach(() => {
        useSystemStore.setState({
            rootComponent: {
                uuid: 'root-uuid',
                id: 'root',
                name: 'Root',
                type: 'component',
                description: '',
                subComponents: [
                    {
                        uuid: 'child-uuid',
                        id: 'child',
                        name: 'Child',
                        type: 'component',
                        description: '',
                        subComponents: [],
                        actors: [],
                        useCaseDiagrams: [],
                        interfaces: [],
                    },
                ],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            },
            selectedNodeId: null,
            uiMode: 'edit',
            browseLocked: false,
            activeVisualizationViewId: null,
            showGeneratedClassDiagramInterfaces: true,
            selectedInterfaceUuid: null,
            parseError: null,
            savedSnapshot: null,
        })
    })

    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('renders the packaged user guide view when requested from the URL', () => {
        window.history.replaceState({}, '', '/?view=user-guide')

        const { container } = render(<App />)

        expect(
            screen.getByRole('heading', { name: 'Integra User Guide', level: 1 })
        ).toBeInTheDocument()
        expect(screen.getByText('Quick Start')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Open app' })).toHaveAttribute('href', '/')
        expect(container.firstElementChild).toHaveClass('overflow-y-auto')
    })

    it('updates the URL when selecting a node from the default app route', async () => {
        const user = userEvent.setup()

        render(<App />)

        await user.click(screen.getByRole('button', { name: 'Select child' }))

        expect(window.location.pathname).toBe('/child')
    })

    it('hydrates the selected node from a deep link on the default app route', async () => {
        window.history.replaceState({}, '', '/child')

        render(<App />)

        await waitFor(() => expect(screen.getByText('Editor child-uuid')).toBeInTheDocument())
    })
})
