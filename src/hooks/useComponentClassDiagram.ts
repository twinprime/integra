import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import type { ComponentNode } from "../store/types"
import { buildComponentClassDiagram } from "../utils/componentClassDiagram"

declare global {
  var __integraNavigate: ((id: string) => void) | undefined
  var __integraIdMap: Record<string, string> | undefined
}

export function useComponentClassDiagram(componentNode: ComponentNode | null) {
  const rootComponent = useSystemStore((s) => s.rootComponent)
  const selectNode = useSystemStore((s) => s.selectNode)
  const elementRef = useRef<HTMLDivElement>(null)
  const bindFunctionsRef = useRef<((el: Element) => void) | undefined>(undefined)
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    const render = async () => {
      if (!componentNode) {
        setSvg("")
        setError("")
        return
      }

      const { mermaidContent, idToUuid } = buildComponentClassDiagram(componentNode, rootComponent)

      if (!mermaidContent) {
        setSvg("")
        setError("")
        return
      }

      globalThis.__integraIdMap = idToUuid
      globalThis.__integraNavigate = (nodeId: string) => {
        const uuid = globalThis.__integraIdMap?.[nodeId]
        if (uuid) selectNode(uuid)
      }

      try {
        const { svg: renderedSvg, bindFunctions } = await mermaid.render(
          `mermaid-comp-class-${Date.now()}`,
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
  }, [componentNode, rootComponent, selectNode])

  useEffect(() => {
    if (!svg || !elementRef.current) return
    bindFunctionsRef.current?.(elementRef.current)
  }, [svg])

  return { svg, error, elementRef }
}
