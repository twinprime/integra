import { useCallback, useEffect } from "react"
import type { ComponentNode, DiagramNode } from "../store/types"
import { buildIdToUuidMap } from "../utils/diagramTransforms"
import { useMermaidBase } from "./useMermaidBase"

// Diagram types where Mermaid's native `click` directive is supported.
// When Mermaid adds sequence diagram support, add "sequence-diagram" here.
const CLICK_DIRECTIVE_TYPES = new Set(["use-case-diagram"])

function buildClickDirectives(idToUuid: Record<string, string>): string {
  return Object.keys(idToUuid)
    .map((id) => `click ${id} __integraNavigate`)
    .join("\n")
}

function transformUseCaseDiagram(
  content: string,
  idToUuid: Record<string, string>,
): string {
  if (content.trim().startsWith("graph") || content.trim().startsWith("flowchart")) {
    return content
  }
  let mermaidContent = "graph TD\n"
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const actorMatch = /^actor\s+"([^"]+)"\s+(?:from\s+\S+\s+)?as\s+(\w+)/.exec(trimmed)
    const useCaseMatch = /^use case\s+"([^"]+)"\s+(?:from\s+\S+\s+)?as\s+(\w+)/.exec(trimmed)
    const componentMatch = /^component\s+"([^"]+)"\s+(?:from\s+\S+\s+)?as\s+(\w+)/.exec(trimmed)
    if (actorMatch) {
      mermaidContent += `    ${actorMatch[2]}["${actorMatch[1]}"]\n`
    } else if (useCaseMatch) {
      mermaidContent += `    ${useCaseMatch[2]}(("${useCaseMatch[1]}"))\n`
    } else if (componentMatch) {
      mermaidContent += `    ${componentMatch[2]}["${componentMatch[1]}"]\n`
    } else {
      mermaidContent += `    ${trimmed}\n`
    }
  }
  mermaidContent += buildClickDirectives(idToUuid)
  return mermaidContent
}

export function useUseCaseDiagram(diagramNode: DiagramNode | null) {
  const buildContent = useCallback(
    (content: string, ownerComp: ComponentNode | null, root: ComponentNode) => {
      const { map: idToUuid } = buildIdToUuidMap(content, "use-case-diagram", ownerComp, root)
      const mermaidContent = transformUseCaseDiagram(content, idToUuid)
      return { mermaidContent, idToUuid }
    },
    [],
  )

  const { svg, error, errorDetails, mermaidSource, bindFunctionsRef, elementRef } =
    useMermaidBase(diagramNode, buildContent)

  // Bind Mermaid's native click handlers after SVG is injected into the DOM
  useEffect(() => {
    if (!svg || !elementRef.current) return
    if (CLICK_DIRECTIVE_TYPES.has(diagramNode?.type ?? "")) {
      bindFunctionsRef.current?.(elementRef.current)
    }
  }, [svg, diagramNode?.type, bindFunctionsRef, elementRef])

  return { svg, error, errorDetails, mermaidSource, elementRef }
}
