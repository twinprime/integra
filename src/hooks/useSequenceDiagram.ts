import { useCallback, useEffect, useRef } from "react"
import type React from "react"
import { useSystemStore, findNode } from "../store/useSystemStore"
import type { ComponentNode, DiagramNode } from "../store/types"
import {
  buildIdToUuidMap,
  RX_PART_NAMED,
  RX_PART_BARE,
} from "../utils/diagramTransforms"
import {
  resolveParticipant,
  resolveInOwner,
  findComponentByInterfaceId,
} from "../utils/diagramResolvers"
import { useMermaidBase } from "./useMermaidBase"

// sender->>receiver: InterfaceId:functionId(params)
const RX_SEQ_MSG =
  /^(\s*)(\w+)(\s*->>\s*)(\w+)(\s*:\s*)(\w+):(\w+)(\([^)]*\))(.*)/
// sender->>receiver: UseCase:ucId[:message]
const RX_SEQ_UC_MSG =
  /^(\s*)(\w+)(\s*->>\s*)(\w+)(\s*:\s*)(UseCase):(\w+)(:([^\n]*))?/

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
    const ucMsg = RX_SEQ_UC_MSG.exec(t)
    if (ucMsg) {
      const [, , , , receiver, , , ucId, , msgLabel] = ucMsg
      const receiverCompNode = findNode([root], participantUuids.get(receiver) ?? "")
      if (receiverCompNode?.type === "component") {
        const receiverComp = receiverCompNode as ComponentNode
        for (const d of receiverComp.useCaseDiagrams) {
          const uc = d.useCases?.find((u) => u.id === ucId)
          if (uc) {
            const label = msgLabel
              ? `${msgLabel.trim()}[UseCase:${ucId}]`
              : `UseCase:${ucId}`
            if (!map[label]) map[label] = uc.uuid
            break
          }
        }
      }
      continue
    }
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

function transformSequenceDiagram(content: string): string {
  let mermaidContent = content
  mermaidContent = mermaidContent.replaceAll(
    /^(\s*(?:actor|component)\s+"[^"]+"\s+)from\s+\S+\s+/gm,
    "$1",
  )
  mermaidContent = mermaidContent.replaceAll(
    /^(\s*)actor\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm,
    (_match, indent, name, id) =>
      name
        ? `${indent}participant ${id} as «actor»<br/>${name}`
        : `${indent}participant ${id} as «actor»<br/>${id}`,
  )
  mermaidContent = mermaidContent.replaceAll(
    /^(\s*)component\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm,
    (_match, indent, name, id) =>
      name
        ? `${indent}participant ${id} as «component»<br/>${name}`
        : `${indent}participant ${id} as «component»<br/>${id}`,
  )
  mermaidContent = mermaidContent.replaceAll(/UseCase:(\w+):([^\n]+)/g, "$2[UseCase:$1]")
  if (!mermaidContent.trim().startsWith("sequenceDiagram")) {
    return "sequenceDiagram\n" + mermaidContent
  }
  return mermaidContent
}

export function useSequenceDiagram(diagramNode: DiagramNode | null) {
  const selectNode = useSystemStore((s) => s.selectNode)
  const participantIdMapRef = useRef<Record<string, string>>({})
  const messageLabelUuidsRef = useRef<Record<string, string>>({})

  const buildContent = useCallback(
    (content: string, ownerComp: ComponentNode | null, root: ComponentNode) => {
      const { map: idToUuid } = buildIdToUuidMap(content, "sequence-diagram", ownerComp, root)
      participantIdMapRef.current = idToUuid
      messageLabelUuidsRef.current = buildMessageLabelUuidMap(content, ownerComp, root)
      const mermaidContent = transformSequenceDiagram(content)
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
      if (g) (g as HTMLElement).style.cursor = "pointer"
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
      const label = msgText.textContent?.trim() ?? ""
      const uuid = messageLabelUuidsRef.current[label]
      if (uuid) {
        selectNode(uuid)
        return
      }
    }

    // Actor box click: walk up ancestors to find the rect with the participant name
    let actorRect: Element | null = null
    if (target.classList?.contains("actor-top") || target.classList?.contains("actor-bottom")) {
      actorRect = target
    } else {
      let el: Element | null = target.parentElement
      while (el && el !== elementRef.current) {
        const r = el.querySelector("rect.actor-top, rect.actor-bottom")
        if (r) {
          actorRect = r
          break
        }
        el = el.parentElement
      }
    }
    if (!actorRect) return

    const participantId = actorRect.getAttribute("name")
    if (!participantId) return
    const uuid = participantIdMapRef.current[participantId]
    if (uuid) selectNode(uuid)
  }

  return { svg, error, errorDetails, mermaidSource, elementRef, handleSequenceClick }
}
