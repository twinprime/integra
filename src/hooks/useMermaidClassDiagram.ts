import { useCallback, useEffect, useRef, useState } from "react"
import type React from "react"
import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import type { ComponentNode } from "../store/types"
import type { ClassDiagramBuildResult, SequenceDiagramSource } from "../utils/classDiagramMetadata"

declare global {
  var __integraNavigate: ((id: string) => void) | undefined
}

export function useMermaidClassDiagram<T>(
  buildFn: (node: T, rootComponent: ComponentNode) => ClassDiagramBuildResult,
  node: T | null,
  idPrefix: string,
): {
  svg: string
  error: string
  mermaidSource: string
  elementRef: React.RefObject<HTMLDivElement | null>
  handleDiagramClick: (event: React.MouseEvent<HTMLDivElement>) => void
  handleDiagramMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void
  handleDiagramMouseLeave: () => void
  activeSequenceDiagrams: SequenceDiagramSource[]
  activePopupPosition: { x: number; y: number } | null
  isPopupPinned: boolean
  clearActiveSequenceDiagrams: () => void
  selectSequenceDiagram: (uuid: string) => void
  handlePopupMouseEnter: () => void
  handlePopupMouseLeave: () => void
} {
  const rootComponent = useSystemStore((s) => s.rootComponent)
  const selectNode = useSystemStore((s) => s.selectNode)
  const elementRef = useRef<HTMLDivElement>(null)
  const bindFunctionsRef = useRef<((el: Element) => void) | undefined>(undefined)
  const idToUuidRef = useRef<Record<string, string>>({})
  const relationshipMetadataRef = useRef<ClassDiagramBuildResult["relationshipMetadata"]>([])
  const isPopupPinnedRef = useRef(false)
  const popupHoveredRef = useRef(false)
  const popupCloseTimeoutRef = useRef<number | null>(null)
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const [mermaidSource, setMermaidSource] = useState("")
  const [activeSequenceDiagrams, setActiveSequenceDiagrams] = useState<SequenceDiagramSource[]>([])
  const [activePopupPosition, setActivePopupPosition] = useState<{ x: number; y: number } | null>(null)
  const [isPopupPinned, setIsPopupPinned] = useState(false)

  useEffect(() => {
    isPopupPinnedRef.current = isPopupPinned
  }, [isPopupPinned])

  const openSequencePopup = useCallback(
    (
      sources: SequenceDiagramSource[],
      position: { x: number; y: number } | null,
      pinned: boolean,
    ) => {
      setActiveSequenceDiagrams(sources)
      setActivePopupPosition(position)
      setIsPopupPinned(pinned)
    },
    [],
  )

  const clearActiveSequenceDiagrams = useCallback(() => {
    if (popupCloseTimeoutRef.current != null) {
      window.clearTimeout(popupCloseTimeoutRef.current)
      popupCloseTimeoutRef.current = null
    }
    setActiveSequenceDiagrams([])
    setActivePopupPosition(null)
    setIsPopupPinned(false)
  }, [])

  const selectSequenceDiagram = useCallback(
    (uuid: string) => {
      selectNode(uuid)
      setActiveSequenceDiagrams([])
      setActivePopupPosition(null)
      setIsPopupPinned(false)
    },
    [selectNode],
  )

  useEffect(() => {
    const render = async () => {
      if (!node) {
        setSvg("")
        setError("")
        setMermaidSource("")
        relationshipMetadataRef.current = []
        setActiveSequenceDiagrams([])
        setActivePopupPosition(null)
        setIsPopupPinned(false)
        return
      }

      const { mermaidContent, idToUuid, relationshipMetadata } = buildFn(node, rootComponent)

      if (!mermaidContent) {
        setSvg("")
        setError("")
        setMermaidSource("")
        relationshipMetadataRef.current = []
        setActiveSequenceDiagrams([])
        setActivePopupPosition(null)
        setIsPopupPinned(false)
        return
      }

      idToUuidRef.current = idToUuid
      relationshipMetadataRef.current = relationshipMetadata
      globalThis.__integraNavigate = (nodeId: string) => {
        const uuid = idToUuidRef.current[nodeId]
        if (uuid) selectNode(uuid)
      }

      setMermaidSource(mermaidContent)
      try {
        const { svg: renderedSvg, bindFunctions } = await mermaid.render(
          `mermaid-${idPrefix}-${Date.now()}`,
          mermaidContent,
        )
        bindFunctionsRef.current = bindFunctions
        setSvg(renderedSvg)
        setError("")
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setSvg("")
      }
    }

    void render()
  }, [node, rootComponent, selectNode, buildFn, idPrefix])

  useEffect(() => {
    if (!svg || !elementRef.current) return
    bindFunctionsRef.current?.(elementRef.current)
  }, [svg])

  const annotateDependencyEdges = useCallback(() => {
    if (!svg || !elementRef.current) return

    const labelByEdgeId = new Map<string, Element>()
    elementRef.current.querySelectorAll<Element>("g.edgeLabels g.label[data-id]").forEach((label) => {
      const edgeId = label.getAttribute("data-id")
      if (edgeId) labelByEdgeId.set(edgeId, label)
    })

    elementRef.current.querySelectorAll("[data-integra-edge-hit-target='true']").forEach((target) => {
      target.remove()
    })

    elementRef.current.querySelectorAll<SVGPathElement>("g.edgePaths path[data-edge='true']").forEach((path, index) => {
      const metadata = relationshipMetadataRef.current[index]
      if (!metadata?.sequenceDiagrams.length) return

      const edgeIndex = String(index)
      path.setAttribute("data-integra-edge-index", edgeIndex)
      path.setAttribute("data-integra-edge-clickable", "true")
      path.setAttribute("tabindex", "0")
      path.setAttribute("role", "button")
      path.style.cursor = "pointer"

      const hitTarget = path.cloneNode() as SVGPathElement
      hitTarget.removeAttribute("marker-start")
      hitTarget.removeAttribute("marker-end")
      hitTarget.setAttribute("data-integra-edge-index", edgeIndex)
      hitTarget.setAttribute("data-integra-edge-clickable", "true")
      hitTarget.setAttribute("data-integra-edge-hit-target", "true")
      hitTarget.setAttribute("tabindex", "0")
      hitTarget.setAttribute("role", "button")
      hitTarget.style.stroke = "transparent"
      hitTarget.style.fill = "none"
      hitTarget.style.strokeWidth = "16px"
      hitTarget.style.pointerEvents = "stroke"
      hitTarget.style.cursor = "pointer"
      path.parentNode?.insertBefore(hitTarget, path.nextSibling)

      const edgeId = path.getAttribute("data-id") ?? path.getAttribute("id")
      if (!edgeId) return

      const label = labelByEdgeId.get(edgeId)
      if (!label) return

      label.setAttribute("data-integra-edge-index", edgeIndex)
      label.setAttribute("data-integra-edge-clickable", "true")
      label.closest("g.edgeLabel")?.setAttribute("data-integra-edge-index", edgeIndex)
      label.closest("g.edgeLabel")?.setAttribute("data-integra-edge-clickable", "true")
      label.querySelectorAll("*").forEach((child) => {
        if (child instanceof HTMLElement) child.style.cursor = "pointer"
      })
    })
  }, [svg])

  useEffect(() => {
    annotateDependencyEdges()
  }, [annotateDependencyEdges])

  const getEdgeMetadata = useCallback((target: Element): {
    sources: SequenceDiagramSource[]
  } | null => {
    const edgeTarget = target.closest("[data-integra-edge-index]")
    const edgeIndexValue = edgeTarget?.getAttribute("data-integra-edge-index")
    if (!edgeIndexValue) return null

    const metadata = relationshipMetadataRef.current[Number(edgeIndexValue)]
    if (!metadata?.sequenceDiagrams.length) return null

    return {
      sources: metadata.sequenceDiagrams,
    }
  }, [])

  const cancelPendingPopupClose = useCallback(() => {
    if (popupCloseTimeoutRef.current != null) {
      window.clearTimeout(popupCloseTimeoutRef.current)
      popupCloseTimeoutRef.current = null
    }
  }, [])

  const hideUnpinnedPopup = useCallback(() => {
    if (popupHoveredRef.current || isPopupPinnedRef.current) return
    clearActiveSequenceDiagrams()
  }, [clearActiveSequenceDiagrams])

  const schedulePopupClose = useCallback(() => {
    cancelPendingPopupClose()
    popupCloseTimeoutRef.current = window.setTimeout(() => {
      popupCloseTimeoutRef.current = null
      hideUnpinnedPopup()
    }, 80)
  }, [cancelPendingPopupClose, hideUnpinnedPopup])

  const handleDiagramMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    cancelPendingPopupClose()
    const target = event.target as Element
    const edgeInfo = getEdgeMetadata(target)
    if (!edgeInfo) {
      hideUnpinnedPopup()
      return
    }

    openSequencePopup(edgeInfo.sources, { x: event.clientX, y: event.clientY }, false)
  }, [cancelPendingPopupClose, getEdgeMetadata, hideUnpinnedPopup, openSequencePopup])

  const handleDiagramMouseLeave = useCallback(() => {
    schedulePopupClose()
  }, [schedulePopupClose])

  const handleDiagramClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element
    const edgeInfo = getEdgeMetadata(target)
    if (!edgeInfo) return

    if (edgeInfo.sources.length === 1) {
      selectSequenceDiagram(edgeInfo.sources[0].uuid)
      return
    }

    openSequencePopup(edgeInfo.sources, { x: event.clientX, y: event.clientY }, true)
  }, [getEdgeMetadata, openSequencePopup, selectSequenceDiagram])

  const handlePopupMouseEnter = useCallback(() => {
    cancelPendingPopupClose()
    popupHoveredRef.current = true
  }, [cancelPendingPopupClose])

  const handlePopupMouseLeave = useCallback(() => {
    popupHoveredRef.current = false
    schedulePopupClose()
  }, [schedulePopupClose])

  return {
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
  }
}
