import type { ComponentNode } from "../../store/types"
import { useComponentClassDiagram } from "../../hooks/useComponentClassDiagram"
import { DiagramErrorBanner } from "./DiagramErrorBanner"

interface ComponentClassDiagramProps {
  componentNode: ComponentNode
}

export const ComponentClassDiagram = ({ componentNode }: ComponentClassDiagramProps) => {
  const { svg, error, elementRef } = useComponentClassDiagram(componentNode)

  if (!svg && !error && !componentNode.interfaces?.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No interfaces defined for this component
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
