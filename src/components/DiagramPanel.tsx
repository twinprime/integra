import { useSystemStore, findNode } from "../store/useSystemStore"
import type { DiagramNode } from "../store/types"
import { UseCaseDiagram } from "./diagrams/UseCaseDiagram"
import { SequenceDiagram } from "./diagrams/SequenceDiagram"

export const DiagramPanel = () => {
  const selectedNodeId = useSystemStore((s) => s.selectedNodeId)
  const rootComponent = useSystemStore((s) => s.rootComponent)
  const selectedNode = selectedNodeId ? findNode([rootComponent], selectedNodeId) : null

  if (selectedNode?.type === "use-case-diagram") {
    return <UseCaseDiagram diagramNode={selectedNode as DiagramNode} />
  }
  if (selectedNode?.type === "sequence-diagram") {
    return <SequenceDiagram diagramNode={selectedNode as DiagramNode} />
  }
  return (
    <div className="h-full flex items-center justify-center text-gray-500">
      Open a diagram to visualize
    </div>
  )
}
