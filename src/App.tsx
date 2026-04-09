import { MainLayout } from './layouts/MainLayout'
import { UserGuidePage } from './components/UserGuidePage'
import { ModelPage } from './components/ModelPage'
import { FilePage } from './components/FilePage'
import { TreeView } from './components/TreeView'
import { EditorPanel } from './components/EditorPanel'
import { DiagramPanel } from './components/DiagramPanel'
import { useEntityNavigation } from './hooks/useEntityNavigation'
import { getModelRouteComponentId } from './utils/systemFiles'
import { useSystemStore } from './store/useSystemStore'

function DefaultPage() {
    const rootComponent = useSystemStore((state) => state.rootComponent)
    const { notFoundPath } = useEntityNavigation(rootComponent, '')

    const rightPanel = notFoundPath ? (
        <div className="h-full flex items-center justify-center text-gray-500 text-sm font-mono">
            Entity not found: {notFoundPath}
        </div>
    ) : (
        <EditorPanel />
    )

    return (
        <MainLayout
            leftPanel={<TreeView />}
            rightPanel={rightPanel}
            bottomPanel={<DiagramPanel />}
        />
    )
}

function App() {
    const view = new URLSearchParams(window.location.search).get('view')

    if (view === 'user-guide') {
        return <UserGuidePage />
    }

    if (window.location.pathname.startsWith('/file')) {
        return <FilePage />
    }

    if (getModelRouteComponentId() !== null) {
        return <ModelPage />
    }

    return <DefaultPage />
}

export default App
