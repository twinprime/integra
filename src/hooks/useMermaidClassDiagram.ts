import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import type { ComponentNode } from "../store/types"

declare global {
  var __integraNavigate: ((id: string) => void) | undefined
}

export function useMermaidClassDiagram<T>(
  buildFn: (node: T, rootComponent: ComponentNode) => { mermaidContent: string; idToUuid: Record<string, string> },
  node: T | null,
  idPrefix: string,
): { svg: string; error: string; mermaidSource: string; elementRef: React.RefObject<HTMLDivElement | null> } {
  const rootComponent = useSystemStore((s) => s.rootComponent)
  const selectNode = useSystemStore((s) => s.selectNode)
  const elementRef = useRef<HTMLDivElement>(null)
  const bindFunctionsRef = useRef<((el: Element) => void) | undefined>(undefined)
  const idToUuidRef = useRef<Record<string, string>>({})
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const [mermaidSource, setMermaidSource] = useState("")

  useEffect(() => {
    const render = async () => {
      if (!node) {
        setSvg("")
        setError("")
        setMermaidSource("")
        return
      }

      const { mermaidContent, idToUuid } = buildFn(node, rootComponent)

      if (!mermaidContent) {
        setSvg("")
        setError("")
        setMermaidSource("")
        return
      }

      idToUuidRef.current = idToUuid
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

    render()
  }, [node, rootComponent, selectNode, buildFn, idPrefix])

  useEffect(() => {
    if (!svg || !elementRef.current) return
    bindFunctionsRef.current?.(elementRef.current)
  }, [svg])

  return { svg, error, mermaidSource, elementRef }
}
