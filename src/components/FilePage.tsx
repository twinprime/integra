import { MainLayout } from '../layouts/MainLayout'
import { TreeView } from './TreeView'
import { EditorPanel } from './EditorPanel'
import { DiagramPanel } from './DiagramPanel'
import { useSystemStore } from '../store/useSystemStore'
import { useEntityNavigation } from '../hooks/useEntityNavigation'

export function FilePage() {
    const rootComponent = useSystemStore((s) => s.rootComponent)
    const { notFoundPath } = useEntityNavigation(rootComponent, '/file')

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
