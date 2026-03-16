import { memo, type MouseEventHandler, type RefObject } from "react"
import { DiagramPanZoom } from "./DiagramPanZoom"

type ClassDiagramCanvasProps = {
  svg: string
  elementRef: RefObject<HTMLDivElement | null>
  handleDiagramClick: MouseEventHandler<HTMLDivElement>
  handleDiagramMouseMove: MouseEventHandler<HTMLDivElement>
  handleDiagramMouseLeave: () => void
}

export const ClassDiagramCanvas = memo(function ClassDiagramCanvas({
  svg,
  elementRef,
  handleDiagramClick,
  handleDiagramMouseMove,
  handleDiagramMouseLeave,
}: ClassDiagramCanvasProps) {
  return (
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
  )
})
