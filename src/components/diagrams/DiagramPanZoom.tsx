import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import {
  TransformWrapper,
  TransformComponent,
  useControls,
} from "react-zoom-pan-pinch"
import { ZoomIn, ZoomOut, Maximize2, ArrowLeftRight, Clipboard, Check } from "lucide-react"

const btnClass =
  "bg-white/90 hover:bg-white border border-gray-200 rounded p-1 text-gray-600 hover:text-gray-900 shadow-sm transition-colors"

interface FitRefs {
  fitRef: React.RefObject<() => void>
  fitWidthRef: React.RefObject<() => void>
  clearPendingFitRef?: React.RefObject<() => void>
  contentKey?: string
}

const FitController = ({
  fitRef,
  fitWidthRef,
  clearPendingFitRef,
  contentKey,
}: FitRefs) => {
  const { instance, setTransform } = useControls()
  const instanceRef = useRef(instance)
  const setTransformRef = useRef(setTransform)
  const pendingFitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(() => {
    instanceRef.current = instance
    setTransformRef.current = setTransform
  }, [instance, setTransform])

  const clearPendingFit = useCallback(() => {
    if (pendingFitTimeoutRef.current !== null) {
      clearTimeout(pendingFitTimeoutRef.current)
      pendingFitTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (clearPendingFitRef) {
      clearPendingFitRef.current = clearPendingFit
    }
  }, [clearPendingFit, clearPendingFitRef])

  const scheduleFit = useCallback(
    (fitAction: () => void, delay = 50) => {
      clearPendingFit()
      pendingFitTimeoutRef.current = setTimeout(() => {
        pendingFitTimeoutRef.current = null
        fitAction()
      }, delay)
    },
    [clearPendingFit],
  )

  const getDimensions = useCallback(() => {
    const wrapper = instanceRef.current.wrapperComponent
    const content = instanceRef.current.contentComponent
    if (!wrapper || !content) return null
    const child = content.firstElementChild as HTMLElement | null
    const naturalW = child?.offsetWidth ?? content.offsetWidth
    const naturalH = child?.offsetHeight ?? content.offsetHeight
    if (naturalW === 0 || naturalH === 0) return null
    return {
      wrapperW: wrapper.offsetWidth,
      wrapperH: wrapper.offsetHeight,
      naturalW,
      naturalH,
    }
  }, [])

  const fitDiagram = useCallback(() => {
    const dims = getDimensions()
    if (!dims) return
    const { wrapperW, wrapperH, naturalW, naturalH } = dims
    const fitScale = Math.min(wrapperW / naturalW, wrapperH / naturalH) * 0.9
    const posX = (wrapperW - naturalW * fitScale) / 2
    const posY = (wrapperH - naturalH * fitScale) / 2
    setTransformRef.current(posX, posY, fitScale, 0)
  }, [getDimensions])

  const fitWidth = useCallback(() => {
    const dims = getDimensions()
    if (!dims) return
    const { wrapperW, wrapperH, naturalW, naturalH } = dims
    const scale = (wrapperW / naturalW) * 0.9
    const posX = (wrapperW - naturalW * scale) / 2
    const posY = (wrapperH - naturalH * scale) / 2
    setTransformRef.current(posX, posY, scale, 0)
  }, [getDimensions])

  useEffect(() => {
    fitRef.current = fitDiagram
  }, [fitRef, fitDiagram])
  useEffect(() => {
    fitWidthRef.current = fitWidth
  }, [fitWidthRef, fitWidth])

  useEffect(() => {
    scheduleFit(fitDiagram)
    return () => {
      clearPendingFit()
    }
  }, [clearPendingFit, contentKey, fitDiagram, scheduleFit])

  useEffect(() => {
    const wrapper = instance.wrapperComponent
    if (!wrapper) return

    const observer = new ResizeObserver(() => {
      scheduleFit(fitDiagram)
    })
    observer.observe(wrapper)
    return () => {
      clearPendingFit()
      observer.disconnect()
    }
  }, [clearPendingFit, instance.wrapperComponent, fitDiagram, scheduleFit])

  return null
}

interface ZoomControlsProps extends FitRefs {
  mermaidSource?: string
}

const ZoomControls = ({ fitRef, fitWidthRef, mermaidSource }: ZoomControlsProps) => {
  const { zoomIn, zoomOut } = useControls()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!mermaidSource) return
    void navigator.clipboard.writeText(mermaidSource).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [mermaidSource])
  return (
    <div className="absolute top-2 right-2 z-10 flex gap-1">
      {mermaidSource && (
        <button onClick={handleCopy} className={btnClass} title="Copy Mermaid source">
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
        </button>
      )}
      <button onClick={() => zoomIn()} className={btnClass} title="Zoom in">
        <ZoomIn size={14} />
      </button>
      <button onClick={() => zoomOut()} className={btnClass} title="Zoom out">
        <ZoomOut size={14} />
      </button>
      <button
        onClick={() => fitWidthRef.current()}
        className={btnClass}
        title="Fit width"
      >
        <ArrowLeftRight size={14} />
      </button>
      <button
        onClick={() => fitRef.current()}
        className={btnClass}
        title="Fit to screen"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  )
}

interface DiagramPanZoomProps {
  children: ReactNode
  contentKey?: string
  mermaidSource?: string
}

export const DiagramPanZoom = ({
  children,
  contentKey,
  mermaidSource,
}: DiagramPanZoomProps) => {
  const fitRef = useRef<() => void>(() => {})
  const fitWidthRef = useRef<() => void>(() => {})
  const clearPendingFitRef = useRef<() => void>(() => {})

  return (
    <div
      className="relative flex-1 overflow-hidden bg-white rounded-lg"
      style={{ minHeight: "100px" }}
    >
      <TransformWrapper
        initialScale={1}
        minScale={0.05}
        maxScale={20}
        limitToBounds={false}
        smooth={false}
        wheel={{ step: 0.2 }}
        onWheelStart={() => clearPendingFitRef.current()}
        onPanningStart={() => clearPendingFitRef.current()}
        onZoomStart={() => clearPendingFitRef.current()}
      >
        <FitController
          fitRef={fitRef}
          fitWidthRef={fitWidthRef}
          clearPendingFitRef={clearPendingFitRef}
          contentKey={contentKey}
        />
        <ZoomControls fitRef={fitRef} fitWidthRef={fitWidthRef} mermaidSource={mermaidSource} />
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
