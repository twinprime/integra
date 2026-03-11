import type { ReactNode } from "react"
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch"
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

const btnClass =
  "bg-white/90 hover:bg-white border border-gray-200 rounded p-1 text-gray-600 hover:text-gray-900 shadow-sm transition-colors"

const ZoomControls = () => {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  return (
    <div className="absolute top-2 right-2 z-10 flex gap-1">
      <button onClick={() => zoomIn()} className={btnClass} title="Zoom in">
        <ZoomIn size={14} />
      </button>
      <button onClick={() => zoomOut()} className={btnClass} title="Zoom out">
        <ZoomOut size={14} />
      </button>
      <button onClick={() => resetTransform()} className={btnClass} title="Reset zoom">
        <Maximize2 size={14} />
      </button>
    </div>
  )
}

interface DiagramPanZoomProps {
  children: ReactNode
}

export const DiagramPanZoom = ({ children }: DiagramPanZoomProps) => {
  return (
    <div
      className="relative flex-1 overflow-hidden bg-white rounded-lg"
      style={{ minHeight: "100px" }}
    >
      <TransformWrapper initialScale={1} minScale={0.1} maxScale={5} wheel={{ step: 0.1 }}>
        <ZoomControls />
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: "100%" }}
        >
          {children}
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
