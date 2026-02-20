import { useSystemStore, findNode } from "../store/useSystemStore"
import type { DiagramNode, ComponentNode } from "../store/types"
import { CommonEditor } from "./editor/CommonEditor"
import { ComponentEditor } from "./editor/ComponentEditor"
import { DiagramEditor } from "./editor/DiagramEditor"

export const EditorPanel = () => {
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const rootComponent = useSystemStore((state) => state.rootComponent)
  const updateNode = useSystemStore((state) => state.updateNode)

  const selectedNode = selectedNodeId
    ? findNode([rootComponent], selectedNodeId)
    : null

  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Select a node from the explorer to edit
      </div>
    )
  }

  const handleUpdate = (updates: any) => {
    updateNode(selectedNode.uuid, updates)
  }

  if (
    selectedNode.type === "use-case-diagram" ||
    selectedNode.type === "sequence-diagram"
  ) {
    return (
      <DiagramEditor
        node={selectedNode as DiagramNode}
        onUpdate={handleUpdate}
      />
    )
  }

  if (selectedNode.type === "component") {
    return (
      <ComponentEditor
        node={selectedNode as ComponentNode}
        onUpdate={handleUpdate}
      />
    )
  }

  return <CommonEditor node={selectedNode} onUpdate={handleUpdate} />
}
