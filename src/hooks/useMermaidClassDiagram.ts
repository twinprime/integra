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
  activeSequenceDiagrams: SequenceDiagramSource[]
  clearActiveSequenceDiagrams: () => void
  selectSequenceDiagram: (uuid: string) => void
} {
  const rootComponent = useSystemStore((s) => s.rootComponent)
  const selectNode = useSystemStore((s) => s.selectNode)
  const elementRef = useRef<HTMLDivElement>(null)
  const bindFunctionsRef = useRef<((el: Element) => void) | undefined>(undefined)
  const idToUuidRef = useRef<Record<string, string>>({})
  const relationshipMetadataRef = useRef<ClassDiagramBuildResult["relationshipMetadata"]>([])
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const [mermaidSource, setMermaidSource] = useState("")
  const [activeSequenceDiagrams, setActiveSequenceDiagrams] = useState<SequenceDiagramSource[]>([])

  const clearActiveSequenceDiagrams = useCallback(() => {
    setActiveSequenceDiagrams([])
  }, [])

  const selectSequenceDiagram = useCallback(
    (uuid: string) => {
      selectNode(uuid)
      setActiveSequenceDiagrams([])
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
        return
      }

      const { mermaidContent, idToUuid, relationshipMetadata } = buildFn(node, rootComponent)

      if (!mermaidContent) {
        setSvg("")
        setError("")
        setMermaidSource("")
        relationshipMetadataRef.current = []
        setActiveSequenceDiagrams([])
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
        setMermaidSource("")
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

    elementRef.current.querySelectorAll<SVGPathElement>("g.edgePaths path[data-edge='true']").forEach((path, index) => {
      const metadata = relationshipMetadataRef.current[index]
      if (!metadata?.sequenceDiagrams.length) return

      const edgeIndex = String(index)
      path.setAttribute("data-integra-edge-index", edgeIndex)
      path.setAttribute("data-integra-edge-clickable", "true")
      path.setAttribute("tabindex", "0")
      path.setAttribute("role", "button")
      path.style.cursor = "pointer"

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
  }, [annotateDependencyEdges, activeSequenceDiagrams])

  const handleDiagramClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element
    const edgeTarget = target.closest("[data-integra-edge-index]")
    const edgeIndexValue = edgeTarget?.getAttribute("data-integra-edge-index")
    if (!edgeIndexValue) return

    const metadata = relationshipMetadataRef.current[Number(edgeIndexValue)]
    if (!metadata?.sequenceDiagrams.length) return

    setActiveSequenceDiagrams(metadata.sequenceDiagrams)
  }

  return {
    svg,
    error,
    mermaidSource,
    elementRef,
    handleDiagramClick,
    activeSequenceDiagrams,
    clearActiveSequenceDiagrams,
    selectSequenceDiagram,
  }
}
