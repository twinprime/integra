import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import type { UseCaseNode } from "../store/types"
import { buildUseCaseClassDiagram } from "../utils/useCaseClassDiagram"

declare global {
  interface Window {
    __integraNavigate?: (id: string) => void
    __integraIdMap?: Record<string, string>
  }
}

export function useUseCaseClassDiagram(useCaseNode: UseCaseNode | null) {
  const rootComponent = useSystemStore((s) => s.rootComponent)
  const selectNode = useSystemStore((s) => s.selectNode)
  const elementRef = useRef<HTMLDivElement>(null)
  const bindFunctionsRef = useRef<((el: Element) => void) | undefined>(undefined)
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    const render = async () => {
      if (!useCaseNode) {
        setSvg("")
        setError("")
        return
      }

      const { mermaidContent, idToUuid } = buildUseCaseClassDiagram(useCaseNode, rootComponent)

      if (!mermaidContent) {
        setSvg("")
        setError("")
        return
      }

      window.__integraIdMap = idToUuid
      window.__integraNavigate = (nodeId: string) => {
        const uuid = window.__integraIdMap?.[nodeId]
        if (uuid) selectNode(uuid)
      }

      try {
        const { svg: renderedSvg, bindFunctions } = await mermaid.render(
          `mermaid-uc-class-${Date.now()}`,
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

    render()
  }, [useCaseNode, rootComponent, selectNode])

  // Bind Mermaid click handlers after SVG is injected into the DOM
  useEffect(() => {
    if (!svg || !elementRef.current) return
    bindFunctionsRef.current?.(elementRef.current)
  }, [svg])

  return { svg, error, elementRef }
}
