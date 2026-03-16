import type { UseCaseNode } from "../../store/types"
import { useUseCaseClassDiagram } from "../../hooks/useUseCaseClassDiagram"
import { DiagramErrorBanner } from "./DiagramErrorBanner"
import { DiagramPanZoom } from "./DiagramPanZoom"
import { DependencySourceDialog } from "./DependencySourceDialog"

interface UseCaseClassDiagramProps {
  useCaseNode: UseCaseNode
}

export const UseCaseClassDiagram = ({ useCaseNode }: UseCaseClassDiagramProps) => {
  const {
    svg,
    error,
    mermaidSource,
    elementRef,
    handleDiagramClick,
    handleDiagramMouseMove,
    handleDiagramMouseLeave,
    activeSequenceDiagrams,
    activePopupPosition,
    isPopupPinned,
    clearActiveSequenceDiagrams,
    selectSequenceDiagram,
    handlePopupMouseEnter,
    handlePopupMouseLeave,
  } = useUseCaseClassDiagram(useCaseNode)

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
        <DiagramPanZoom contentKey={svg}>
          <div
            ref={elementRef}
            data-testid="diagram-svg-container"
            className="flex justify-center items-start pt-4"
            dangerouslySetInnerHTML={{ __html: svg }}
            onClick={handleDiagramClick}
            onMouseMove={handleDiagramMouseMove}
            onMouseLeave={handleDiagramMouseLeave}
          />
        </DiagramPanZoom>
      ) : error && mermaidSource ? (
        <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 bg-gray-900 rounded-lg whitespace-pre-wrap font-mono">
          {mermaidSource}
        </pre>
      ) : (
        <div ref={elementRef} className="flex-1" style={{ minHeight: "100px" }} />
      )}
      <DependencySourceDialog
        sources={activeSequenceDiagrams}
        position={activePopupPosition}
        pinned={isPopupPinned}
        onClose={clearActiveSequenceDiagrams}
        onSelect={selectSequenceDiagram}
        onMouseEnter={handlePopupMouseEnter}
        onMouseLeave={handlePopupMouseLeave}
      />
    </div>
  )
}
