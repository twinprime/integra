import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { useSystemStore, findNode } from "../store/useSystemStore"
import type { ComponentNode, DiagramNode } from "../store/types"

declare global {
  interface Window {
    __integraNavigate?: (id: string) => void
    __integraIdMap?: Record<string, string>
  }
}

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
})

export type BuildContent = (
  content: string,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
) => { mermaidContent: string; idToUuid: Record<string, string> }

export function useMermaidBase(diagramNode: DiagramNode | null, buildContent: BuildContent) {
  const rootComponent = useSystemStore((s) => s.rootComponent)
  const selectNode = useSystemStore((s) => s.selectNode)
  const elementRef = useRef<HTMLDivElement>(null)
  const bindFunctionsRef = useRef<((el: Element) => void) | undefined>(undefined)
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const [errorDetails, setErrorDetails] = useState("")
  const [mermaidSource, setMermaidSource] = useState("")

  useEffect(() => {
    const render = async () => {
      if (!diagramNode?.content?.trim()) {
        setSvg("")
        setError("")
        setErrorDetails("")
        setMermaidSource("")
        return
      }
      try {
        const ownerNode = findNode([rootComponent], diagramNode.ownerComponentUuid)
        const ownerComp =
          ownerNode?.type === "component" ? (ownerNode as ComponentNode) : null
        const { mermaidContent, idToUuid } = buildContent(
          diagramNode.content,
          ownerComp,
          rootComponent,
        )
        window.__integraIdMap = idToUuid
        window.__integraNavigate = (nodeId: string) => {
          const uuid = window.__integraIdMap?.[nodeId]
          if (uuid) selectNode(uuid)
        }
        setMermaidSource(mermaidContent)
        const { svg: renderedSvg, bindFunctions } = await mermaid.render(
          `mermaid-${Date.now()}`,
          mermaidContent,
        )
        bindFunctionsRef.current = bindFunctions
        setSvg(renderedSvg)
        setError("")
        setMermaidSource("")
      } catch (err) {
        setError("Invalid Diagram Syntax")
        setErrorDetails(err instanceof Error ? err.message : String(err))
        setSvg("")
      }
    }
    render()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramNode, buildContent])

  return { svg, error, errorDetails, mermaidSource, bindFunctionsRef, elementRef, selectNode }
}
