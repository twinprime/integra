import { MainLayout } from './layouts/MainLayout'
import { DeveloperGuidePage } from './components/DeveloperGuidePage'
import { TreeView } from './components/TreeView'
import { EditorPanel } from './components/EditorPanel'
import { DiagramPanel } from './components/DiagramPanel'

function App() {
    const view = new URLSearchParams(window.location.search).get('view')

    if (view === 'developer-guide') {
        return <DeveloperGuidePage />
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
