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

function buildParticipantUuidMap(
  content: string,
  ownerComp: ComponentNode,
  root: ComponentNode,
): Map<string, string> {
  const uuids = new Map<string, string>()
  for (const line of content.split("\n")) {
    const t = line.trim()
    const named = RX_PART_NAMED.exec(t)
    if (named) {
      const uuid = resolveParticipant(named[2], named[7], named[5], root, ownerComp)
      if (uuid) uuids.set(named[7], uuid)
      continue
    }
    const bare = RX_PART_BARE.exec(t)
    if (bare) {
      const uuid = resolveInOwner(ownerComp, bare[4])
      if (uuid) uuids.set(bare[4], uuid)
    }
  }
  return uuids
}

function resolveUcMsgEntry(
  ucMsg: RegExpExecArray,
  participantUuids: Map<string, string>,
  root: ComponentNode,
): { label: string; uuid: string } | null {
  const [, , , , receiver, , , ucId, , msgLabel] = ucMsg
  const receiverNode = findNode([root], participantUuids.get(receiver) ?? "")
  if (receiverNode?.type !== "component") return null
  for (const d of receiverNode.useCaseDiagrams) {
    const uc = d.useCases?.find((u) => u.id === ucId)
    if (uc) {
      const label = msgLabel ? `${msgLabel.trim()}[UseCase:${ucId}]` : `UseCase:${ucId}`
      return { label, uuid: uc.uuid }
    }
  }
  return null
}

function buildMessageLabelUuidMap(
  content: string,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): Record<string, string> {
  const map: Record<string, string> = {}
  if (!ownerComp) return map

  const participantUuids = buildParticipantUuidMap(content, ownerComp, root)

  for (const line of content.split("\n")) {
    const t = line.trim()
    const ucMsg = RX_SEQ_UC_MSG.exec(t)
    if (ucMsg) {
      const entry = resolveUcMsgEntry(ucMsg, participantUuids, root)
      if (entry && !map[entry.label]) map[entry.label] = entry.uuid
      continue
    }
    const msg = RX_SEQ_MSG.exec(t)
    if (msg) {
      const [, , , , , , ifaceId, fnId, params] = msg
      const uuid = findComponentByInterfaceId(root, ifaceId)
      const label = `${ifaceId}:${fnId}${params}`
      if (uuid && !map[label]) map[label] = uuid
    }
  }

  return map
}

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
