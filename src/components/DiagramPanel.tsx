import type { ReactNode } from 'react'
import { useSystemStore } from '../store/useSystemStore'
import { findNode } from '../nodes/nodeTree'
import type { DiagramNode, Node } from '../store/types'
import { UseCaseDiagram } from './diagrams/UseCaseDiagram'
import { SequenceDiagram } from './diagrams/SequenceDiagram'
import { UseCaseClassDiagram } from './diagrams/UseCaseClassDiagram'
import { ComponentClassDiagram } from './diagrams/ComponentClassDiagram'
import { UseCaseDiagramClassDiagram } from './diagrams/UseCaseDiagramClassDiagram'
import { VisualizationViewControls } from './diagrams/VisualizationViewControls'

type VisualizationView = {
    id: string
    label: string
    render: (toolbarContent?: ReactNode) => ReactNode
}

function getVisualizationViews(selectedNode: Node): VisualizationView[] {
    switch (selectedNode.type) {
        case 'use-case-diagram':
            return [
                {
                    id: 'diagram',
                    label: 'Diagram',
                    render: (toolbarContent) => (
                        <UseCaseDiagram
                            diagramNode={selectedNode}
                            toolbarContent={toolbarContent}
                        />
                    ),
                },
                {
                    id: 'class-diagram',
                    label: 'Class Diagram',
                    render: (toolbarContent) => (
                        <UseCaseDiagramClassDiagram
                            useCaseDiagramNode={selectedNode}
                            toolbarContent={toolbarContent}
                        />
                    ),
                },
            ]
        case 'sequence-diagram':
            return [
                {
                    id: 'diagram',
                    label: 'Diagram',
                    render: () => <SequenceDiagram diagramNode={selectedNode as DiagramNode} />,
                },
            ]
        case 'use-case':
            return [
                {
                    id: 'class-diagram',
                    label: 'Class Diagram',
                    render: (toolbarContent) => (
                        <UseCaseClassDiagram
                            useCaseNode={selectedNode}
                            toolbarContent={toolbarContent}
                        />
                    ),
                },
            ]
        case 'component':
            return [
                {
                    id: 'class-diagram',
                    label: 'Class Diagram',
                    render: (toolbarContent) => (
                        <ComponentClassDiagram
                            componentNode={selectedNode}
                            toolbarContent={toolbarContent}
                        />
                    ),
                },
            ]
        default:
            return []
    }
}

export const DiagramPanel = () => {
    const selectedNodeId = useSystemStore((s) => s.selectedNodeId)
    const activeVisualizationViewId = useSystemStore((s) => s.activeVisualizationViewId)
    const selectVisualizationView = useSystemStore((s) => s.selectVisualizationView)
    const rootComponent = useSystemStore((s) => s.rootComponent)
    const selectedNode = selectedNodeId ? findNode([rootComponent], selectedNodeId) : null

    if (!selectedNode) {
        return (
            <div className="h-full flex items-center justify-center text-gray-500">
                Open a diagram to visualize
            </div>
        )
    }

    const views = getVisualizationViews(selectedNode)
    if (!views.length) {
        return (
            <div className="h-full flex items-center justify-center text-gray-500">
                Open a diagram to visualize
            </div>
        )
    }

    const activeView = views.find((view) => view.id === activeVisualizationViewId) ?? views[0]
    const toolbarContent =
        views.length > 1 ? (
            <VisualizationViewControls
                views={views.map(({ id, label }) => ({ id, label }))}
                activeViewId={activeView.id}
                onChange={selectVisualizationView}
            />
        ) : undefined

    return <>{activeView.render(toolbarContent)}</>
}
