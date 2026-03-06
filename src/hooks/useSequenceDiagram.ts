import { useCallback, useEffect, useRef } from "react"
import type React from "react"
import { useSystemStore } from "../store/useSystemStore"
import type { ComponentNode, DiagramNode } from "../store/types"
import { generateSequenceMermaid } from "../parser/sequenceDiagram/mermaidGenerator"
import { useMermaidBase } from "./useMermaidBase"

function findActorRect(target: Element, container: Element): Element | null {
  if (target.classList?.contains("actor-top") || target.classList?.contains("actor-bottom")) {
    return target
  }
  let el: Element | null = target.parentElement
  while (el && el !== container) {
    const r = el.querySelector("rect.actor-top, rect.actor-bottom")
    if (r) return r
    el = el.parentElement
  }
  return null
}

export function useSequenceDiagram(diagramNode: DiagramNode | null) {
  const selectNode = useSystemStore((s) => s.selectNode)
  const participantIdMapRef = useRef<Record<string, string>>({})
  const messageLabelUuidsRef = useRef<Record<string, string>>({})

  const buildContent = useCallback(
    (content: string, ownerComp: ComponentNode | null, root: ComponentNode, ownerCompUuid: string) => {
      const { mermaidContent, idToUuid, messageLabelToUuid } = generateSequenceMermaid(content, ownerComp, root, ownerCompUuid)
      participantIdMapRef.current = idToUuid
      messageLabelUuidsRef.current = messageLabelToUuid
      return { mermaidContent, idToUuid }
    },
    [],
  )

  const { svg, error, errorDetails, mermaidSource, elementRef } =
    useMermaidBase(diagramNode, buildContent)

  // Add cursor/underline styling to navigable elements after SVG renders
  useEffect(() => {
    if (!svg || !elementRef.current) return
    elementRef.current.querySelectorAll("rect.actor-top, rect.actor-bottom").forEach((rect) => {
      const g = rect.parentElement
      if (g) g.style.cursor = "pointer"
    })
    const labelMap = messageLabelUuidsRef.current
    elementRef.current.querySelectorAll<SVGTextElement>("text.messageText").forEach((el) => {
      if (labelMap[el.textContent?.trim() ?? ""]) {
        el.style.cursor = "pointer"
        el.style.textDecoration = "underline"
      }
    })
  }, [svg, elementRef])

  const handleSequenceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element
    if (!elementRef.current) return

    // Message label click (function ref or use-case ref)
    const msgText = target.closest("text.messageText")
    if (msgText) {
      const uuid = messageLabelUuidsRef.current[msgText.textContent?.trim() ?? ""]
      if (uuid) { selectNode(uuid); return }
    }

    // Actor box click: use participant name attribute for UUID lookup
    const actorRect = findActorRect(target, elementRef.current)
    const participantId = actorRect?.getAttribute("name")
    if (participantId) {
      const uuid = participantIdMapRef.current[participantId]
      if (uuid) selectNode(uuid)
    }
  }

  return { svg, error, errorDetails, mermaidSource, elementRef, handleSequenceClick }
}
