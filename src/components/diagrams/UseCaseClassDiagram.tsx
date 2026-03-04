import type { UseCaseNode } from "../../store/types"
import { useUseCaseClassDiagram } from "../../hooks/useUseCaseClassDiagram"
import { DiagramErrorBanner } from "./DiagramErrorBanner"

interface UseCaseClassDiagramProps {
  useCaseNode: UseCaseNode
}

export const UseCaseClassDiagram = ({ useCaseNode }: UseCaseClassDiagramProps) => {
  const { svg, error, elementRef } = useUseCaseClassDiagram(useCaseNode)

  if (!useCaseNode.sequenceDiagrams.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No sequence diagrams defined for this use case
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      <DiagramErrorBanner error={error} details={error} />
      {svg ? (
        <div
          ref={elementRef}
          data-testid="diagram-svg-container"
          className="flex-1 overflow-auto flex justify-center items-start pt-4 bg-white rounded-lg"
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ minHeight: "100px" }}
        />
      ) : (
        <div ref={elementRef} className="flex-1" style={{ minHeight: "100px" }} />
      )}
    </div>
  )
}
