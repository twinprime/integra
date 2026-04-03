import { MainLayout } from './layouts/MainLayout'
import { UserGuidePage } from './components/UserGuidePage'
import { ModelPage } from './components/ModelPage'
import { TreeView } from './components/TreeView'
import { EditorPanel } from './components/EditorPanel'
import { DiagramPanel } from './components/DiagramPanel'
import { getModelRouteComponentId } from './utils/systemFiles'

function App() {
    const view = new URLSearchParams(window.location.search).get('view')

    if (view === 'user-guide') {
        return <UserGuidePage />
    }

    if (getModelRouteComponentId() !== null) {
        return <ModelPage />
    }

    return (
        <MainLayout
            leftPanel={<TreeView />}
            rightPanel={<EditorPanel />}
            bottomPanel={<DiagramPanel />}
        />
    )
}

export default App
