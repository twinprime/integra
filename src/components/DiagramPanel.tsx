import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { useSystemStore, findNode } from "../store/useSystemStore"
import type { DiagramNode } from "../store/types"

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
})

const transformToMermaid = (content: string, type: string): string => {
  if (type === "use-case-diagram") {
    if (
      content.trim().startsWith("graph") ||
      content.trim().startsWith("flowchart")
    ) {
      return content
    }

    let mermaidContent = "graph TD\n"
    const lines = content.split("\n")

    lines.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      const actorMatch = /^actor\s+"([^"]+)"\s+as\s+(\w+)/.exec(trimmed)
      const useCaseMatch = /^use case\s+"([^"]+)"\s+as\s+(\w+)/.exec(trimmed)

      if (actorMatch) {
        mermaidContent += `    ${actorMatch[2]}["${actorMatch[1]}"]\n`
      } else if (useCaseMatch) {
        mermaidContent += `    ${useCaseMatch[2]}(("${useCaseMatch[1]}"))\n`
      } else {
        // Assume it's a relationship or comment
        mermaidContent += `    ${trimmed}\n`
      }
    })

    return mermaidContent
  }

  if (type === "sequence-diagram") {
    let mermaidContent = content

    // Transform actor declarations to participant with stereotype
    // Pattern: actor "Name" as id  OR  actor id
    mermaidContent = mermaidContent.replace(
      /^(\s*)actor\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm,
      (match, indent, name, id) => {
        if (name) {
          return `${indent}participant ${id} as «actor»<br/>${name}`
        }
        return `${indent}participant ${id} as «actor»<br/>${id}`
      },
    )

    // Transform component declarations to participant with stereotype
    // Pattern: component "Name" as id  OR  component id
    mermaidContent = mermaidContent.replace(
      /^(\s*)component\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm,
      (match, indent, name, id) => {
        if (name) {
          return `${indent}participant ${id} as «component»<br/>${name}`
        }
        return `${indent}participant ${id} as «component»<br/>${id}`
      },
    )

    if (!mermaidContent.trim().startsWith("sequenceDiagram")) {
      return "sequenceDiagram\n" + mermaidContent
    }
    return mermaidContent
  }

  return content
}

export const DiagramPanel = () => {
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const system = useSystemStore((state) => state.system)
  const elementRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [errorDetails, setErrorDetails] = useState<string>("")
  const [showTooltip, setShowTooltip] = useState<boolean>(false)

  const selectedNode = selectedNodeId
    ? findNode([system], selectedNodeId)
    : null

  useEffect(() => {
    const renderDiagram = async () => {
      if (!selectedNode) {
        setSvg("")
        return
      }

      const isDiagram =
        selectedNode.type === "use-case-diagram" ||
        selectedNode.type === "sequence-diagram"

      if (!isDiagram) {
        setSvg("") // Or maybe show something specific for other nodes if needed
        return
      }

      const diagramNode = selectedNode as DiagramNode

      if (!diagramNode.content || diagramNode.content.trim() === "") {
        setSvg("")
        return
      }

      try {
        // Determine if valid mermaid code
        // We generate a unique ID for the SVG
        const id = `mermaid-${Date.now()}`
        const mermaidContent = transformToMermaid(
          diagramNode.content,
          diagramNode.type,
        )
        console.log("Transformed Mermaid Content:\n", mermaidContent)
        const { svg } = await mermaid.render(id, mermaidContent)
        setSvg(svg)
        setError("")
      } catch (err: any) {
        console.error("Mermaid rendering error:", err)
        // Mermaid creates an error element in the DOM by default, we might handle it gracefully
        setError("Invalid Diagram Syntax")
        setErrorDetails(err?.message || err?.toString() || "Unknown error")
        setSvg("")
      }
    }

    renderDiagram()
  }, [selectedNode]) // Trigger re-render when the node object updates (which happens on content change)

  // Actually we need to depend on content changes.
  // The store updates the node object, so `selectedNode` reference changes on update.

  if (
    !selectedNode ||
    (selectedNode.type !== "use-case-diagram" &&
      selectedNode.type !== "sequence-diagram")
  ) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Open a diagram to visualize
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      {error && (
        <div
          className="relative text-red-500 p-2 text-sm cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {error}
          {showTooltip && (
            <div className="absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs p-2 rounded shadow-lg z-10 max-w-md whitespace-pre-wrap">
              {errorDetails}
            </div>
          )}
        </div>
      )}
      <div
        ref={elementRef}
        className="flex-1 overflow-auto flex justify-center items-start pt-4 bg-white rounded-lg"
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ minHeight: "100px" }}
      />
    </div>
  )
}
