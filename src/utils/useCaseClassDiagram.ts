import type { ComponentNode, UseCaseNode } from "../store/types"
import { findNode } from "../store/useSystemStore"
import { buildIdToUuidMap } from "./diagramTransforms"
import { findComponentByInterfaceId } from "./diagramResolvers"

const ACTOR_NAMED = /^actor\s+"[^"]+"\s+(?:from\s+\S+\s+)?as\s+(\w+)/
const ACTOR_BARE = /^actor\s+(\w+)$/
const COMPONENT_NAMED = /^component\s+"[^"]+"\s+(?:from\s+\S+\s+)?as\s+(\w+)/
const COMPONENT_BARE = /^component\s+(\w+)$/
// Interface method call: sender->>receiver: InterfaceId:fnId(params)
const IFACE_MSG_PATTERN = /(\w+)\s*->>\s*(\w+)\s*:\s*(?!UseCase:)(\w+):(\w+)\(([^)]*)\)/g
// Any message (including returns -->>): sender->>receiver or sender-->>receiver
const ANY_MSG_PATTERN = /(\w+)\s*--?>>\s*(\w+)\s*:\s*(?!UseCase:)(.+)/g

type ParticipantKind = "actor" | "component"

type Participant = {
  nodeId: string
  name: string
  uuid: string
  kind: ParticipantKind
}

export function buildUseCaseClassDiagram(
  useCaseNode: UseCaseNode,
  rootComponent: ComponentNode,
): { mermaidContent: string; idToUuid: Record<string, string> } {
  // keyed by UUID for deduplication across sequence diagrams
  const participantsMap = new Map<string, Participant>()
  const interfacesSet = new Set<string>()
  const interfaces: { componentNodeId: string; interfaceId: string }[] = []
  const interfaceMethods = new Map<string, Set<string>>() // interfaceId -> method signatures
  const depsSet = new Set<string>()
  const deps: { fromNodeId: string; toNodeId: string }[] = []
  const directArrows: { fromNodeId: string; toNodeId: string }[] = []

  for (const seqDiagram of useCaseNode.sequenceDiagrams) {
    if (!seqDiagram.content?.trim()) continue

    const ownerNode = findNode([rootComponent], seqDiagram.ownerComponentUuid)
    const ownerComp = ownerNode?.type === "component" ? (ownerNode as ComponentNode) : null

    const { map: aliasToUuid } = buildIdToUuidMap(
      seqDiagram.content,
      "sequence-diagram",
      ownerComp,
      rootComponent,
    )

    // Determine participant kinds from declaration lines
    const aliasToKind = new Map<string, ParticipantKind>()
    for (const line of seqDiagram.content.split("\n")) {
      const t = line.trim()
      if (ACTOR_NAMED.test(t)) aliasToKind.set(ACTOR_NAMED.exec(t)![1], "actor")
      else if (ACTOR_BARE.test(t)) aliasToKind.set(ACTOR_BARE.exec(t)![1], "actor")
      else if (COMPONENT_NAMED.test(t)) aliasToKind.set(COMPONENT_NAMED.exec(t)![1], "component")
      else if (COMPONENT_BARE.test(t)) aliasToKind.set(COMPONENT_BARE.exec(t)![1], "component")
    }

    // Register participants (deduplicated by UUID)
    for (const [alias, uuid] of Object.entries(aliasToUuid)) {
      if (participantsMap.has(uuid)) continue
      const node = findNode([rootComponent], uuid)
      if (!node) continue
      participantsMap.set(uuid, {
        nodeId: node.id,
        name: node.name,
        uuid,
        kind: aliasToKind.get(alias) ?? (node.type === "actor" ? "actor" : "component"),
      })
    }

    // Parse messages for interface classes and dependency arrows
    IFACE_MSG_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = IFACE_MSG_PATTERN.exec(seqDiagram.content)) !== null) {
      const [, senderAlias, , interfaceId, methodName, params] = match

      // Record method on the interface (deduplicated)
      if (!interfaceMethods.has(interfaceId)) interfaceMethods.set(interfaceId, new Set())
      interfaceMethods.get(interfaceId)!.add(`${methodName}(${params})`)

      const senderUuid = aliasToUuid[senderAlias]

      // Sender ..> Interface (dependency)
      if (senderUuid) {
        const sender = participantsMap.get(senderUuid)
        if (sender) {
          const key = `${sender.nodeId}|${interfaceId}`
          if (!depsSet.has(key)) {
            depsSet.add(key)
            deps.push({ fromNodeId: sender.nodeId, toNodeId: interfaceId })
          }
        }
      }

      // Component ..|> Interface (realization/provides)
      const ownerCompUuid = findComponentByInterfaceId(rootComponent, interfaceId)
      if (ownerCompUuid) {
        const ownerComp = participantsMap.get(ownerCompUuid)
        if (ownerComp) {
          const key = `${ownerComp.nodeId}|${interfaceId}`
          if (!interfacesSet.has(key)) {
            interfacesSet.add(key)
            interfaces.push({ componentNodeId: ownerComp.nodeId, interfaceId })
          }
        }
      }
    }

    // Direct arrows for plain (non-interface) messages
    const ifaceMsgTexts = new Set<string>()
    {
      const re = /(\w+)\s*->>\s*(\w+)\s*:\s*(?!UseCase:)\w+:\w+\([^)]*\)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(seqDiagram.content)) !== null) {
        ifaceMsgTexts.add(m[0])
      }
    }
    ANY_MSG_PATTERN.lastIndex = 0
    let anyMatch: RegExpExecArray | null
    while ((anyMatch = ANY_MSG_PATTERN.exec(seqDiagram.content)) !== null) {
      if (ifaceMsgTexts.has(anyMatch[0])) continue // already handled above
      const [, senderAlias, receiverAlias] = anyMatch
      if (senderAlias === receiverAlias) continue // skip self-messages
      const senderUuid = aliasToUuid[senderAlias]
      const receiverUuid = aliasToUuid[receiverAlias]
      if (senderUuid && receiverUuid) {
        const sender = participantsMap.get(senderUuid)
        const receiver = participantsMap.get(receiverUuid)
        if (sender && receiver) {
          const key = `direct|${sender.nodeId}|${receiver.nodeId}`
          if (!depsSet.has(key)) {
            depsSet.add(key)
            directArrows.push({ fromNodeId: sender.nodeId, toNodeId: receiver.nodeId })
          }
        }
      }
    }
  }

  if (participantsMap.size === 0) {
    return { mermaidContent: "", idToUuid: {} }
  }

  const idToUuid: Record<string, string> = {}
  for (const p of participantsMap.values()) {
    idToUuid[p.nodeId] = p.uuid
  }

  const lines: string[] = ["classDiagram"]

  // Actor / component classes
  for (const p of participantsMap.values()) {
    if (p.kind === "actor") {
      lines.push(`    class ${p.nodeId}["${p.name}"]:::${p.kind} {`)
      lines.push(`        <<actor>>`)
      lines.push(`    }`)
    } else {
      lines.push(`    class ${p.nodeId}["${p.name}"]:::${p.kind}`)
    }
  }

  // Interface classes with <<interface>> annotation and methods
  for (const { interfaceId } of interfaces) {
    lines.push(`    class ${interfaceId} {`)
    lines.push(`        <<interface>>`)
    for (const method of interfaceMethods.get(interfaceId) ?? []) {
      lines.push(`        +${method}`)
    }
    lines.push(`    }`)
  }

  // Component ..|> Interface  (realization — component provides the interface)
  for (const { componentNodeId, interfaceId } of interfaces) {
    lines.push(`    ${componentNodeId} ..|> ${interfaceId}`)
  }

  // Sender ..> Interface  (dependency — sender uses the interface)
  for (const { fromNodeId, toNodeId } of deps) {
    lines.push(`    ${fromNodeId} ..> ${toNodeId}`)
  }

  // Sender ..> Receiver  (direct association for non-interface messages)
  for (const { fromNodeId, toNodeId } of directArrows) {
    lines.push(`    ${fromNodeId} ..> ${toNodeId}`)
  }

  // Click directives for navigable nodes (actors and components only)
  for (const nodeId of Object.keys(idToUuid)) {
    lines.push(`    click ${nodeId} call __integraNavigate("${nodeId}")`)
  }

  return { mermaidContent: lines.join("\n"), idToUuid }
}
