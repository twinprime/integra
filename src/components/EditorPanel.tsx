import { useSystemStore } from '../store/useSystemStore'
import { findNode } from '../nodes/nodeTree'
import type { DiagramNode } from '../store/types'
import { findNearestComponentAncestor } from '../utils/nodeUtils'
import { CommonEditor } from './editor/CommonEditor'
import { ComponentEditor } from './editor/ComponentEditor'
import { DiagramEditor } from './editor/DiagramEditor'

export const EditorPanel = () => {
    const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
    const rootComponent = useSystemStore((state) => state.rootComponent)
    const updateNode = useSystemStore((state) => state.updateNode)

    const selectedNode = selectedNodeId ? findNode([rootComponent], selectedNodeId) : null

    if (!selectedNode) {
        return (
            <div className="h-full flex items-center justify-center text-gray-500">
                Select a node from the explorer to edit
            </div>
        )
    }

    const handleUpdate = (updates: Record<string, unknown>) => {
        updateNode(selectedNode.uuid, updates)
    }

    const contextComponentUuid =
        selectedNode.type === 'component'
            ? selectedNode.uuid
            : (findNearestComponentAncestor(rootComponent, selectedNode.uuid)?.uuid ??
              rootComponent.uuid)

    if (selectedNode.type === 'use-case-diagram' || selectedNode.type === 'sequence-diagram') {
        return <DiagramEditor node={selectedNode as DiagramNode} onUpdate={handleUpdate} />
    }

    if (selectedNode.type === 'component') {
        return (
            <ComponentEditor
                key={selectedNode.uuid}
                node={selectedNode}
                onUpdate={handleUpdate}
                contextComponentUuid={contextComponentUuid}
            />
        )
    }

    return (
        <CommonEditor
            key={selectedNode.uuid}
            node={selectedNode}
            onUpdate={handleUpdate}
            contextComponentUuid={contextComponentUuid}
        />
    )
}
