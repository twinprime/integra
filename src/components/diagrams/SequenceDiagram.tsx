import { useSystemStore } from "../../store/useSystemStore"
import type { DiagramNode } from "../../store/types"
import { useSequenceDiagram } from "../../hooks/useSequenceDiagram"
import { DiagramErrorBanner } from "./DiagramErrorBanner"
import { DiagramPanZoom } from "./DiagramPanZoom"

interface SequenceDiagramProps {
  diagramNode: DiagramNode
}

export const SequenceDiagram = ({ diagramNode }: SequenceDiagramProps) => {
  const parseError = useSystemStore((s) => s.parseError)
  const { svg, error, errorDetails, mermaidSource, elementRef, handleSequenceClick } =
    useSequenceDiagram(diagramNode)

  return (
    <div className="w-full h-full flex flex-col">
      <DiagramErrorBanner error={parseError || error} details={parseError || errorDetails} />
      {svg ? (
        <DiagramPanZoom>
          <div
            ref={elementRef}
            data-testid="diagram-svg-container"
            className="flex justify-center items-start pt-4"
            dangerouslySetInnerHTML={{ __html: svg }}
            onClick={handleSequenceClick}
          />
        </DiagramPanZoom>
      ) : error && mermaidSource ? (
        <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 bg-gray-900 rounded-lg whitespace-pre-wrap font-mono">
          {mermaidSource}
        </pre>
      ) : (
        <div ref={elementRef} className="flex-1" style={{ minHeight: "100px" }} />
      )}
    </div>
  )
}
