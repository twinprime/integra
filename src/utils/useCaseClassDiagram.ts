import type { ComponentNode, UseCaseNode } from "../store/types"
import { findNode } from "../store/useSystemStore"
import { buildIdToUuidMap } from "./diagramTransforms"
import { findComponentByInterfaceId } from "./diagramResolvers"

// Interface method call: sender->>receiver: InterfaceId:fnId(params)
const IFACE_MSG_SRC = String.raw`(\w+)\s*->>\s*(\w+)\s*:\s*(?!UseCase:)(\w+):(\w+)\(([^)]*)\)`
// Any message (including returns -->>): sender->>receiver or sender-->>receiver
const ANY_MSG_SRC = String.raw`(\w+)\s*--?>>\s*(\w+)\s*:\s*(?!UseCase:)(.+)`

const ACTOR_NAMED = /^actor\s+"[^"]+"\s+(?:from\s+\S+\s+)?as\s+(\w+)/
const ACTOR_BARE = /^actor\s+(\w+)$/
const COMPONENT_NAMED = /^component\s+"[^"]+"\s+(?:from\s+\S+\s+)?as\s+(\w+)/
const COMPONENT_BARE = /^component\s+(\w+)$/

type ParticipantKind = "actor" | "component"

type Participant = {
  nodeId: string
  name: string
  uuid: string
  kind: ParticipantKind
}

type Arrow = { fromNodeId: string; toNodeId: string }
type InterfaceEntry = { componentNodeId: string; interfaceId: string }

type ClassDiagramState = {
  interfacesSet: Set<string>
  interfaces: InterfaceEntry[]
  interfaceMethods: Map<string, Set<string>>
  depsSet: Set<string>
  deps: Arrow[]
  directArrows: Arrow[]
}

function parseParticipantKinds(content: string): Map<string, ParticipantKind> {
  const aliasToKind = new Map<string, ParticipantKind>()
  for (const line of content.split("\n")) {
    const t = line.trim()
    if (ACTOR_NAMED.test(t)) aliasToKind.set(ACTOR_NAMED.exec(t)![1], "actor")
    else if (ACTOR_BARE.test(t)) aliasToKind.set(ACTOR_BARE.exec(t)![1], "actor")
    else if (COMPONENT_NAMED.test(t)) aliasToKind.set(COMPONENT_NAMED.exec(t)![1], "component")
    else if (COMPONENT_BARE.test(t)) aliasToKind.set(COMPONENT_BARE.exec(t)![1], "component")
  }
  return aliasToKind
}

function registerParticipants(
  aliasToUuid: Record<string, string>,
  aliasToKind: Map<string, ParticipantKind>,
  participantsMap: Map<string, Participant>,
  rootComponent: ComponentNode,
): void {
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
}

function parseIfaceMessages(
  content: string,
  aliasToUuid: Record<string, string>,
  participantsMap: Map<string, Participant>,
  rootComponent: ComponentNode,
  state: ClassDiagramState,
): void {
  const re = new RegExp(IFACE_MSG_SRC, "g")
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const [, senderAlias, , interfaceId, methodName, params] = match

    if (!state.interfaceMethods.has(interfaceId)) state.interfaceMethods.set(interfaceId, new Set())
    state.interfaceMethods.get(interfaceId)!.add(`${methodName}(${params})`)

    const sender = participantsMap.get(aliasToUuid[senderAlias])
    if (sender) {
      const key = `${sender.nodeId}|${interfaceId}`
      if (!state.depsSet.has(key)) {
        state.depsSet.add(key)
        state.deps.push({ fromNodeId: sender.nodeId, toNodeId: interfaceId })
      }
    }

    const ownerCompUuid = findComponentByInterfaceId(rootComponent, interfaceId)
    const ownerComp = ownerCompUuid ? participantsMap.get(ownerCompUuid) : undefined
    if (ownerComp) {
      const key = `${ownerComp.nodeId}|${interfaceId}`
      if (!state.interfacesSet.has(key)) {
        state.interfacesSet.add(key)
        state.interfaces.push({ componentNodeId: ownerComp.nodeId, interfaceId })
      }
    }
  }
}

function parseDirectArrows(
  content: string,
  aliasToUuid: Record<string, string>,
  participantsMap: Map<string, Participant>,
  state: ClassDiagramState,
): void {
  const ifaceMsgTexts = new Set<string>()
  const ifaceRe = new RegExp(IFACE_MSG_SRC, "g")
  let m: RegExpExecArray | null
  while ((m = ifaceRe.exec(content)) !== null) ifaceMsgTexts.add(m[0])

  const anyRe = new RegExp(ANY_MSG_SRC, "g")
  let anyMatch: RegExpExecArray | null
  while ((anyMatch = anyRe.exec(content)) !== null) {
    if (ifaceMsgTexts.has(anyMatch[0])) continue
    const [, senderAlias, receiverAlias] = anyMatch
    if (senderAlias === receiverAlias) continue
    const sender = participantsMap.get(aliasToUuid[senderAlias])
    const receiver = participantsMap.get(aliasToUuid[receiverAlias])
    if (sender && receiver) {
      const key = `direct|${sender.nodeId}|${receiver.nodeId}`
      if (!state.depsSet.has(key)) {
        state.depsSet.add(key)
        state.directArrows.push({ fromNodeId: sender.nodeId, toNodeId: receiver.nodeId })
      }
    }
  }
}

function buildMermaidLines(
  participantsMap: Map<string, Participant>,
  state: ClassDiagramState,
  idToUuid: Record<string, string>,
): string[] {
  const { interfaces, interfaceMethods, deps, directArrows } = state
  const lines: string[] = ["classDiagram"]

  for (const p of participantsMap.values()) {
    if (p.kind === "actor") {
      lines.push(`    class ${p.nodeId}["${p.name}"]:::${p.kind} {`)
      lines.push(`        <<actor>>`)
      lines.push(`    }`)
    } else {
      lines.push(`    class ${p.nodeId}["${p.name}"]:::${p.kind}`)
    }
  }

  for (const { interfaceId } of interfaces) {
    lines.push(`    class ${interfaceId} {`)
    lines.push(`        <<interface>>`)
    for (const method of interfaceMethods.get(interfaceId) ?? []) {
      lines.push(`        +${method}`)
    }
    lines.push(`    }`)
  }

  for (const { componentNodeId, interfaceId } of interfaces) {
    lines.push(`    ${componentNodeId} ..|> ${interfaceId}`)
  }
  for (const { fromNodeId, toNodeId } of deps) {
    lines.push(`    ${fromNodeId} ..> ${toNodeId}`)
  }
  for (const { fromNodeId, toNodeId } of directArrows) {
    lines.push(`    ${fromNodeId} ..> ${toNodeId}`)
  }

  for (const nodeId of Object.keys(idToUuid)) {
    lines.push(`    click ${nodeId} call __integraNavigate("${nodeId}")`)
  }
  return lines
}

export function buildUseCaseClassDiagram(
  useCaseNode: UseCaseNode,
  rootComponent: ComponentNode,
): { mermaidContent: string; idToUuid: Record<string, string> } {
  const participantsMap = new Map<string, Participant>()
  const state: ClassDiagramState = {
    interfacesSet: new Set(),
    interfaces: [],
    interfaceMethods: new Map(),
    depsSet: new Set(),
    deps: [],
    directArrows: [],
  }

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
    const aliasToKind = parseParticipantKinds(seqDiagram.content)
    registerParticipants(aliasToUuid, aliasToKind, participantsMap, rootComponent)
    parseIfaceMessages(seqDiagram.content, aliasToUuid, participantsMap, rootComponent, state)
    parseDirectArrows(seqDiagram.content, aliasToUuid, participantsMap, state)
  }

  if (participantsMap.size === 0) {
    return { mermaidContent: "", idToUuid: {} }
  }

  const idToUuid: Record<string, string> = {}
  for (const p of participantsMap.values()) {
    idToUuid[p.nodeId] = p.uuid
  }

  return { mermaidContent: buildMermaidLines(participantsMap, state, idToUuid).join("\n"), idToUuid }
}
