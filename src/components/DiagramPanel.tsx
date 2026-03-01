import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { useSystemStore, findNode } from "../store/useSystemStore"
import type { ComponentNode, DiagramNode } from "../store/types"
import { resolveInOwner, resolveParticipant } from "../utils/diagramResolvers"

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

// ─── regex patterns (mirrors DiagramSpecPreview) ─────────────────────────────

const RX_PART_NAMED =
  /^(\s*)(actor|component|use\s+case)(\s+"[^"]*")(\s+from\s+([\w/-]+))?(\s+as\s+)(\w+)/

const RX_PART_BARE = /^(\s*)(actor|component)(\s+)(\w+)/

// ─── click helpers ────────────────────────────────────────────────────────────

function buildClickDirectives(idToUuid: Record<string, string>): string {
  return Object.keys(idToUuid)
    .map((id) => `click ${id} __integraNavigate`)
    .join("\n")
}

function buildIdToUuidMap(
  content: string,
  type: string,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): Record<string, string> {
  const map: Record<string, string> = {}
  if (!ownerComp) return map

  const lines = content.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (type === "sequence-diagram") {
      const named = RX_PART_NAMED.exec(trimmed)
      if (named) {
        const keyword = named[2]
        const fromPath = named[5]
        const id = named[7]
        const uuid = resolveParticipant(keyword, id, fromPath, root, ownerComp)
        if (uuid) map[id] = uuid
        continue
      }
      const bare = RX_PART_BARE.exec(trimmed)
      if (bare) {
        const id = bare[4]
        const uuid = resolveInOwner(ownerComp, id)
        if (uuid) map[id] = uuid
      }
    } else if (type === "use-case-diagram") {
      const named = RX_PART_NAMED.exec(trimmed)
      if (named) {
        const keyword = named[2]
        const fromPath = named[5]
        const id = named[7]
        const uuid = resolveParticipant(keyword, id, fromPath, root, ownerComp)
        if (uuid) map[id] = uuid
      }
    }
  }
  return map
}

const transformToMermaid = (
  content: string,
  type: string,
  idToUuid: Record<string, string> = {},
): string => {
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
        // Assume it's a relationship or comment
        mermaidContent += `    ${trimmed}\n`
      }
    })

    // Append click directives for resolved nodes
    mermaidContent += buildClickDirectives(idToUuid)

    return mermaidContent
  }

  if (type === "sequence-diagram") {
    let mermaidContent = content

    // Strip optional "from <path>" between quoted name and "as" before transforming
    mermaidContent = mermaidContent.replaceAll(
      /^(\s*(?:actor|component)\s+"[^"]+"\s+)from\s+\S+\s+/gm,
      "$1",
    )

    // Transform actor declarations to participant with stereotype
    // Pattern: actor "Name" as id  OR  actor id
    mermaidContent = mermaidContent.replaceAll(
      /^(\s*)actor\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm,
      (_match, indent, name, _id) => {
        if (name) {
          return `${indent}participant ${_id} as «actor»<br/>${name}`
        }
        return `${indent}participant ${_id} as «actor»<br/>${_id}`
      },
    )

    // Transform component declarations to participant with stereotype
    // Pattern: component "Name" as id  OR  component id
    mermaidContent = mermaidContent.replaceAll(
      /^(\s*)component\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm,
      (_match, indent, name, _id) => {
        if (name) {
          return `${indent}participant ${_id} as «component»<br/>${name}`
        }
        return `${indent}participant ${_id} as «component»<br/>${_id}`
      },
    )

    // Replace UseCase:id:message → message (label override); UseCase:id alone stays as-is
    mermaidContent = mermaidContent.replaceAll(/UseCase:\w+:([^\n]+)/g, "$1")

    // Append click directives for resolved participants
    const clicks = buildClickDirectives(idToUuid)
    if (clicks) mermaidContent += "\n" + clicks

    if (!mermaidContent.trim().startsWith("sequenceDiagram")) {
      return "sequenceDiagram\n" + mermaidContent
    }
    return mermaidContent
  }

  return content
}

export const DiagramPanel = () => {
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const rootComponent = useSystemStore((state) => state.rootComponent)
  const selectNode = useSystemStore((state) => state.selectNode)
  const elementRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [errorDetails, setErrorDetails] = useState<string>("")
  const [mermaidSource, setMermaidSource] = useState<string>("")
  const [showTooltip, setShowTooltip] = useState<boolean>(false)
  const parseError = useSystemStore((state) => state.parseError)

  const clearDiagram = () => {
    setSvg("")
    setError("")
    setErrorDetails("")
    setMermaidSource("")
  }

  const selectedNode = selectedNodeId
    ? findNode([rootComponent], selectedNodeId)
    : null

  useEffect(() => {
    const renderDiagram = async () => {
      if (!selectedNode) {
        clearDiagram()
        return
      }

      const isDiagram =
        selectedNode.type === "use-case-diagram" ||
        selectedNode.type === "sequence-diagram"

      if (!isDiagram) {
        clearDiagram()
        return
      }

      const diagramNode = selectedNode as DiagramNode

      if (!diagramNode.content || diagramNode.content.trim() === "") {
        clearDiagram()
        return
      }

      try {
        const id = `mermaid-${Date.now()}`
        const ownerNode = findNode([rootComponent], diagramNode.ownerComponentUuid)
        const ownerComp = ownerNode?.type === "component" ? (ownerNode as ComponentNode) : null
        const idToUuid = buildIdToUuidMap(diagramNode.content, diagramNode.type, ownerComp, rootComponent)
        window.__integraIdMap = idToUuid
        window.__integraNavigate = (nodeId: string) => {
          const uuid = window.__integraIdMap?.[nodeId]
          if (uuid) selectNode(uuid)
        }
        const mermaidContent = transformToMermaid(
          diagramNode.content,
          diagramNode.type,
          idToUuid,
        )
        setMermaidSource(mermaidContent)
        const { svg } = await mermaid.render(id, mermaidContent)
        setSvg(svg)
        setError("")
        setMermaidSource("")
      } catch (err: unknown) {
        console.error("Mermaid rendering error:", err)
        setError("Invalid Diagram Syntax")
        setErrorDetails(err instanceof Error ? err.message : String(err))
        setSvg("")
      }
    }

    renderDiagram()
  }, [selectedNode]) // Trigger re-render when the node object updates (which happens on content change)

  // Actually we need to depend on content changes.
  // The store updates the node object, so `selectedNode` reference changes on update.

  const renderDiagramArea = () => {
    if (svg) {
      return (
        <div
          ref={elementRef}
          className="flex-1 overflow-auto flex justify-center items-start pt-4 bg-white rounded-lg"
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ minHeight: "100px" }}
        />
      )
    }
    if (error && mermaidSource) {
      return (
        <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 bg-gray-900 rounded-lg whitespace-pre-wrap font-mono">
          {mermaidSource}
        </pre>
      )
    }
    return <div ref={elementRef} className="flex-1" style={{ minHeight: "100px" }} />
  }

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
      {(parseError || error) && (
        <button
          type="button"
          className="relative w-full text-left text-red-500 p-2 text-sm cursor-help bg-transparent border-0"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
        >
          {parseError || error}
          {showTooltip && (
            <div className="absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs p-2 rounded shadow-lg z-10 max-w-md whitespace-pre-wrap">
              {parseError || errorDetails}
            </div>
          )}
        </button>
      )}
      {renderDiagramArea()}
    </div>
  )
}
