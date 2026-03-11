import { type ReactNode, useCallback, useEffect, useRef } from "react"
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch"
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

const btnClass =
  "bg-white/90 hover:bg-white border border-gray-200 rounded p-1 text-gray-600 hover:text-gray-900 shadow-sm transition-colors"

const FitController = ({ fitRef }: { fitRef: React.RefObject<() => void> }) => {
  const { instance, setTransform } = useControls()

  const fitDiagram = useCallback(() => {
    const wrapper = instance.wrapperComponent
    const content = instance.contentComponent
    if (!wrapper || !content) return
    const wrapperW = wrapper.offsetWidth
    const wrapperH = wrapper.offsetHeight
    // The react-transform-component has display:flex, so our children are flex items
    // that shrink to their content size — NOT the full content div width.
    // Use the first child's dimensions to get the actual diagram size.
    const child = content.firstElementChild as HTMLElement | null
    const naturalW = child?.offsetWidth ?? content.offsetWidth
    const naturalH = child?.offsetHeight ?? content.offsetHeight
    if (naturalW === 0 || naturalH === 0) return
    const fitScale = Math.min(wrapperW / naturalW, wrapperH / naturalH) * 0.9
    const posX = (wrapperW - naturalW * fitScale) / 2
    const posY = (wrapperH - naturalH * fitScale) / 2
    setTransform(posX, posY, fitScale, 0)
  }, [instance, setTransform])

  useEffect(() => {
    fitRef.current = fitDiagram
  }, [fitRef, fitDiagram])

  useEffect(() => {
    const content = instance.contentComponent
    if (!content) return
    const observer = new ResizeObserver(() => {
      setTimeout(fitDiagram, 50)
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [instance.contentComponent, fitDiagram])

  return null
}

const ZoomControls = ({ fitRef }: { fitRef: React.RefObject<() => void> }) => {
  const { zoomIn, zoomOut } = useControls()
  return (
    <div className="absolute top-2 right-2 z-10 flex gap-1">
      <button onClick={() => zoomIn()} className={btnClass} title="Zoom in">
        <ZoomIn size={14} />
      </button>
      <button onClick={() => zoomOut()} className={btnClass} title="Zoom out">
        <ZoomOut size={14} />
      </button>
      <button onClick={() => fitRef.current()} className={btnClass} title="Fit to screen">
        <Maximize2 size={14} />
      </button>
    </div>
  )
}

interface DiagramPanZoomProps {
  children: ReactNode
}

export const DiagramPanZoom = ({ children }: DiagramPanZoomProps) => {
  const fitRef = useRef<() => void>(() => {})

  return (
    <div
      className="relative flex-1 overflow-hidden bg-white rounded-lg"
      style={{ minHeight: "100px" }}
    >
      <TransformWrapper initialScale={1} minScale={0.05} maxScale={20} wheel={{ step: 0.1 }}>
        <FitController fitRef={fitRef} />
        <ZoomControls fitRef={fitRef} />
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
