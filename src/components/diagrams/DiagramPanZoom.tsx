import { type ReactNode, useCallback, useEffect, useRef } from "react"
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch"
import { ZoomIn, ZoomOut, Maximize2, ArrowLeftRight } from "lucide-react"

const btnClass =
  "bg-white/90 hover:bg-white border border-gray-200 rounded p-1 text-gray-600 hover:text-gray-900 shadow-sm transition-colors"

interface FitRefs {
  fitRef: React.RefObject<() => void>
  fitWidthRef: React.RefObject<() => void>
}

const FitController = ({ fitRef, fitWidthRef }: FitRefs) => {
  const { instance, setTransform } = useControls()

  const getDimensions = useCallback(() => {
    const wrapper = instance.wrapperComponent
    const content = instance.contentComponent
    if (!wrapper || !content) return null
    const child = content.firstElementChild as HTMLElement | null
    const naturalW = child?.offsetWidth ?? content.offsetWidth
    const naturalH = child?.offsetHeight ?? content.offsetHeight
    if (naturalW === 0 || naturalH === 0) return null
    return { wrapperW: wrapper.offsetWidth, wrapperH: wrapper.offsetHeight, naturalW, naturalH }
  }, [instance])

  const fitDiagram = useCallback(() => {
    const dims = getDimensions()
    if (!dims) return
    const { wrapperW, wrapperH, naturalW, naturalH } = dims
    const fitScale = Math.min(wrapperW / naturalW, wrapperH / naturalH) * 0.9
    const posX = (wrapperW - naturalW * fitScale) / 2
    const posY = (wrapperH - naturalH * fitScale) / 2
    setTransform(posX, posY, fitScale, 0)
  }, [getDimensions, setTransform])

  const fitWidth = useCallback(() => {
    const dims = getDimensions()
    if (!dims) return
    const { wrapperW, wrapperH, naturalW, naturalH } = dims
    const scale = (wrapperW / naturalW) * 0.9
    const posX = (wrapperW - naturalW * scale) / 2
    const posY = (wrapperH - naturalH * scale) / 2
    setTransform(posX, posY, scale, 0)
  }, [getDimensions, setTransform])

  useEffect(() => { fitRef.current = fitDiagram }, [fitRef, fitDiagram])
  useEffect(() => { fitWidthRef.current = fitWidth }, [fitWidthRef, fitWidth])

  useEffect(() => {
    const content = instance.contentComponent
    const wrapper = instance.wrapperComponent
    if (!content && !wrapper) return
    let timer: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(fitDiagram, 50)
    })
    if (content) observer.observe(content)
    if (wrapper) observer.observe(wrapper)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [instance.contentComponent, instance.wrapperComponent, fitDiagram])

  return null
}

const ZoomControls = ({ fitRef, fitWidthRef }: FitRefs) => {
  const { zoomIn, zoomOut } = useControls()
  return (
    <div className="absolute top-2 right-2 z-10 flex gap-1">
      <button onClick={() => zoomIn()} className={btnClass} title="Zoom in">
        <ZoomIn size={14} />
      </button>
      <button onClick={() => zoomOut()} className={btnClass} title="Zoom out">
        <ZoomOut size={14} />
      </button>
      <button onClick={() => fitWidthRef.current()} className={btnClass} title="Fit width">
        <ArrowLeftRight size={14} />
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
  const fitWidthRef = useRef<() => void>(() => {})

  return (
    <div
      className="relative flex-1 overflow-hidden bg-white rounded-lg"
      style={{ minHeight: "100px" }}
    >
      <TransformWrapper initialScale={1} minScale={0.05} maxScale={20} limitToBounds={false} smooth={false} wheel={{ step: 0.3 }}>
        <FitController fitRef={fitRef} fitWidthRef={fitWidthRef} />
        <ZoomControls fitRef={fitRef} fitWidthRef={fitWidthRef} />
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
