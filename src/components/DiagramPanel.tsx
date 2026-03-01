import { useEffect, useRef, useState } from "react"
import type React from "react"
import mermaid from "mermaid"
import { useSystemStore, findNode } from "../store/useSystemStore"
import type { ComponentNode, DiagramNode } from "../store/types"
import { resolveInOwner, resolveParticipant, findComponentByInterfaceId } from "../utils/diagramResolvers"

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

// sender->>receiver: InterfaceId:functionId(params)
const RX_SEQ_MSG =
  /^(\s*)(\w+)(\s*->>\s*)(\w+)(\s*:\s*)(\w+):(\w+)(\([^)]*\))(.*)/
// sender->>receiver: UseCase:ucId[:message]
const RX_SEQ_UC_MSG =
  /^(\s*)(\w+)(\s*->>\s*)(\w+)(\s*:\s*)(UseCase):(\w+)(:([^\n]*))?/

// Diagram types where Mermaid's native `click` directive is supported.
// When Mermaid adds sequence diagram support, add "sequence-diagram" here
// and delete the DOM-delegation block below.
const CLICK_DIRECTIVE_TYPES = new Set(["use-case-diagram"])

function buildClickDirectives(
  idToUuid: Record<string, string>,
  type: string,
): string {
  if (!CLICK_DIRECTIVE_TYPES.has(type)) return ""
  return Object.keys(idToUuid)
    .map((id) => `click ${id} __integraNavigate`)
    .join("\n")
}

function buildIdToUuidMap(
  content: string,
  type: string,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): { map: Record<string, string>; orderedUuids: string[] } {
  const map: Record<string, string> = {}
  const orderedUuids: string[] = []
  if (!ownerComp) return { map, orderedUuids }

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
        if (uuid) {
          map[id] = uuid
          orderedUuids.push(uuid)
        }
        continue
      }
      const bare = RX_PART_BARE.exec(trimmed)
      if (bare) {
        const id = bare[4]
        const uuid = resolveInOwner(ownerComp, id)
        if (uuid) {
          map[id] = uuid
          orderedUuids.push(uuid)
        }
      }
    } else if (type === "use-case-diagram") {
      const named = RX_PART_NAMED.exec(trimmed)
      if (named) {
        const keyword = named[2]
        const fromPath = named[5]
        const id = named[7]
        const uuid = resolveParticipant(keyword, id, fromPath, root, ownerComp)
        if (uuid) {
          map[id] = uuid
          orderedUuids.push(uuid)
        }
      }
    }
  }
  return { map, orderedUuids }
}

// Builds a map of { mermaidLabel → uuid } for navigable sequence message labels.
// Used to wire clicks on .messageText SVG elements.
function buildMessageLabelUuidMap(
  content: string,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): Record<string, string> {
  const map: Record<string, string> = {}
  if (!ownerComp) return map

  // Build participant → uuid map for receiver lookups
  const participantUuids = new Map<string, string>()
  for (const line of content.split("\n")) {
    const t = line.trim()
    const named = RX_PART_NAMED.exec(t)
    if (named) {
      const uuid = resolveParticipant(named[2], named[7], named[5], root, ownerComp)
      if (uuid) participantUuids.set(named[7], uuid)
      continue
    }
    const bare = RX_PART_BARE.exec(t)
    if (bare) {
      const uuid = resolveInOwner(ownerComp, bare[4])
      if (uuid) participantUuids.set(bare[4], uuid)
    }
  }

  for (const line of content.split("\n")) {
    const t = line.trim()

    // UseCase:ucId or UseCase:ucId:message — label after transform is msgLabel ?? "UseCase:ucId"
    const ucMsg = RX_SEQ_UC_MSG.exec(t)
    if (ucMsg) {
      const [, , , , receiver, , , ucId, , msgLabel] = ucMsg
      const receiverCompNode = findNode([root], participantUuids.get(receiver) ?? "")
      if (receiverCompNode?.type === "component") {
        const receiverComp = receiverCompNode as ComponentNode
        for (const d of receiverComp.useCaseDiagrams) {
          const uc = d.useCases?.find((u) => u.id === ucId)
          if (uc) {
            const label = msgLabel ? `${msgLabel.trim()}[UseCase:${ucId}]` : `UseCase:${ucId}`
            if (!map[label]) map[label] = uc.uuid  // first match wins on collision
            break
          }
        }
      }
      continue
    }

    // InterfaceId:functionId(params) — label is unchanged in the SVG
    const msg = RX_SEQ_MSG.exec(t)
    if (msg) {
      const [, , , , , , ifaceId, fnId, params] = msg
      const uuid = findComponentByInterfaceId(root, ifaceId)
      if (uuid) {
        const label = `${ifaceId}:${fnId}${params}`
        if (!map[label]) map[label] = uuid
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

      const actorMatch =
        /^actor\s+"([^"]+)"\s+(?:from\s+\S+\s+)?as\s+(\w+)/.exec(trimmed)
      const useCaseMatch =
        /^use case\s+"([^"]+)"\s+(?:from\s+\S+\s+)?as\s+(\w+)/.exec(trimmed)
      const componentMatch =
        /^component\s+"([^"]+)"\s+(?:from\s+\S+\s+)?as\s+(\w+)/.exec(trimmed)

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

    // Append click directives for resolved nodes (use-case diagrams only)
    mermaidContent += buildClickDirectives(idToUuid, type)

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

    // Replace UseCase:id:message → message[UseCase:id] for uniqueness; UseCase:id alone stays as-is
    mermaidContent = mermaidContent.replaceAll(/UseCase:(\w+):([^\n]+)/g, "$2[UseCase:$1]")

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
  const participantUuidsRef = useRef<string[]>([])
  const messageLabelUuidsRef = useRef<Record<string, string>>({})
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
        const ownerNode = findNode(
          [rootComponent],
          diagramNode.ownerComponentUuid,
        )
        const ownerComp =
          ownerNode?.type === "component" ? (ownerNode as ComponentNode) : null
        const { map: idToUuid, orderedUuids } = buildIdToUuidMap(
          diagramNode.content,
          diagramNode.type,
          ownerComp,
          rootComponent,
        )
        participantUuidsRef.current = orderedUuids
        messageLabelUuidsRef.current = buildMessageLabelUuidMap(
          diagramNode.content, ownerComp, rootComponent,
        )
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
        let { svg } = await mermaid.render(id, mermaidContent)

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

  // DOM-delegation fallback: add cursor:pointer to actor box groups and navigable message labels.
  // Remove this effect when CLICK_DIRECTIVE_TYPES includes "sequence-diagram".
  useEffect(() => {
    if (!svg || !elementRef.current || CLICK_DIRECTIVE_TYPES.has(selectedNode?.type ?? "")) return
    // Actor boxes: style the parent <g> so both rect and text label show pointer
    elementRef.current.querySelectorAll("rect.actor-top, rect.actor-bottom").forEach((rect) => {
      const g = rect.parentElement
      if (g) (g as HTMLElement).style.cursor = "pointer"
    })
    // Navigable message labels
    const labelMap = messageLabelUuidsRef.current
    elementRef.current.querySelectorAll<SVGTextElement>("text.messageText").forEach((el) => {
      if (labelMap[el.textContent?.trim() ?? ""]) {
        el.style.cursor = "pointer"
        el.style.textDecoration = "underline"
      }
    })
  }, [svg, selectedNode?.type])

  // DOM-delegation click handler for diagram types not in CLICK_DIRECTIVE_TYPES.
  // Remove when CLICK_DIRECTIVE_TYPES includes "sequence-diagram".
  const handleSequenceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element
    if (!elementRef.current) return

    // Message label click (function ref or use-case ref)
    const msgText = target.closest("text.messageText")
    if (msgText) {
      const label = msgText.textContent?.trim() ?? ""
      const uuid = messageLabelUuidsRef.current[label]
      if (uuid) { selectNode(uuid); return }
    }

    // Actor box click: direct on rect, or on text label inside actor group
    let actorRect: Element | null = null
    if (target.classList?.contains("actor-top") || target.classList?.contains("actor-bottom")) {
      actorRect = target
    } else {
      const g = target.closest("g")
      if (g) actorRect = g.querySelector(":scope > rect.actor-top, :scope > rect.actor-bottom")
    }
    if (!actorRect) return

    // Map to participant index: actor-top rects appear in declaration order (left→right)
    const topRects = Array.from(elementRef.current.querySelectorAll("rect.actor-top"))
    const clickedX = actorRect.getAttribute("x")
    const idx = topRects.findIndex((r) => r.getAttribute("x") === clickedX)
    if (idx < 0) return

    const uuid = participantUuidsRef.current[idx]
    if (uuid) selectNode(uuid)
  }

  const renderDiagramArea = () => {
    if (svg) {
      const useDomDelegation =
        selectedNode && !CLICK_DIRECTIVE_TYPES.has(selectedNode.type)
      return (
        <div
          ref={elementRef}
          className="flex-1 overflow-auto flex justify-center items-start pt-4 bg-white rounded-lg"
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ minHeight: "100px" }}
          onClick={useDomDelegation ? handleSequenceClick : undefined}
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
    return (
      <div ref={elementRef} className="flex-1" style={{ minHeight: "100px" }} />
    )
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
