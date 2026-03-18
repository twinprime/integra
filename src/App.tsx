import { MainLayout } from './layouts/MainLayout'
import { TreeView } from './components/TreeView'
import { EditorPanel } from './components/EditorPanel'
import { DiagramPanel } from './components/DiagramPanel'

function App() {
    return (
        <MainLayout
            leftPanel={<TreeView />}
            rightPanel={<EditorPanel />}
            bottomPanel={<DiagramPanel />}
        />
    )
}

export default App
