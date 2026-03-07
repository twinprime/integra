import type { ComponentNode, SequenceDiagramNode } from "../store/types"
import { findNode } from "../store/useSystemStore"
import { resolveInOwner } from "./diagramResolvers"
import { parseSequenceDiagramCst } from "../parser/sequenceDiagram/parser"
import { buildSeqAst, flattenMessages } from "../parser/sequenceDiagram/visitor"
import { findNodeByPath } from "./nodeUtils"
import { collectAllDiagrams } from "../nodes/nodeTree"

type ParticipantKind = "actor" | "component"

type Participant = {
  nodeId: string
  name: string
  uuid: string
  kind: ParticipantKind
}

function resolveDeclarationUuid(
  path: string[],
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): string | undefined {
  if (path.length === 1) {
    return ownerComp ? resolveInOwner(ownerComp, path[0]) : undefined
  }
  return findNodeByPath(root, path.join("/")) ?? undefined
}

function registerParticipants(
  ast: ReturnType<typeof buildSeqAst>,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
  participantsMap: Map<string, Participant>,
  aliasToUuid: Map<string, string>,
): void {
  for (const decl of ast.declarations) {
    const uuid = resolveDeclarationUuid(decl.path, ownerComp, root)
    if (!uuid) continue
    aliasToUuid.set(decl.id, uuid)
    if (participantsMap.has(uuid)) continue
    const node = findNode([root], uuid)
    if (!node) continue
    participantsMap.set(uuid, {
      nodeId: node.id,
      name: node.name,
      uuid,
      kind: decl.entityType,
    })
  }
}

export function buildComponentClassDiagram(
  component: ComponentNode,
  rootComponent: ComponentNode,
): { mermaidContent: string; idToUuid: Record<string, string> } {
  if (!component.interfaces?.length) {
    return { mermaidContent: "", idToUuid: {} }
  }

  const targetInterfaceIds = new Set(component.interfaces.map((i) => i.id))

  const dependentParticipants = new Map<string, Participant>()
  const depArrows: Array<{ fromNodeId: string; toNodeId: string }> = []
  const depArrowsSet = new Set<string>()

  for (const { diagram, ownerComponentUuid } of collectAllDiagrams(rootComponent)) {
    if (diagram.type !== "sequence-diagram") continue
    const seqDiagram = diagram as SequenceDiagramNode
    if (!seqDiagram.content?.trim()) continue

    const ownerNode = findNode([rootComponent], ownerComponentUuid)
    const ownerComp = ownerNode?.type === "component" ? (ownerNode as ComponentNode) : null

    const { cst } = parseSequenceDiagramCst(seqDiagram.content)
    const ast = buildSeqAst(cst)

    const participantsMap = new Map<string, Participant>()
    const aliasToUuid = new Map<string, string>()
    registerParticipants(ast, ownerComp, rootComponent, participantsMap, aliasToUuid)

    const messages = flattenMessages(ast.statements)

    for (const msg of messages) {
      if (!msg.functionRef) continue
      const { interfaceId } = msg.functionRef
      if (!targetInterfaceIds.has(interfaceId)) continue

      // Verify the receiver resolves to the target component (disambiguates shared interface IDs)
      const receiverUuid = aliasToUuid.get(msg.to)
      if (receiverUuid !== component.uuid) continue

      const senderUuid = aliasToUuid.get(msg.from)
      // Skip self-references (component calling its own interface)
      if (!senderUuid || senderUuid === component.uuid) continue

      const sender = participantsMap.get(senderUuid)
      if (!sender) continue

      if (!dependentParticipants.has(senderUuid)) {
        dependentParticipants.set(senderUuid, sender)
      }

      const arrowKey = `${sender.nodeId}|${interfaceId}`
      if (!depArrowsSet.has(arrowKey)) {
        depArrowsSet.add(arrowKey)
        depArrows.push({ fromNodeId: sender.nodeId, toNodeId: interfaceId })
      }
    }
  }

  const lines: string[] = ["classDiagram"]

  lines.push(`    class ${component.id}["${component.name}"]:::component`)

  for (const iface of component.interfaces) {
    lines.push(`    class ${iface.id} {`)
    lines.push(`        <<interface>>`)
    for (const fn of iface.functions) {
      const params = fn.parameters
        .map((p) => `${p.name}: ${p.type}${p.required ? "" : "?"}`)
        .join(", ")
      lines.push(`        +${fn.id}(${params})`)
    }
    lines.push(`    }`)
  }

  for (const iface of component.interfaces) {
    lines.push(`    ${component.id} ..|> ${iface.id}`)
  }

  for (const dep of dependentParticipants.values()) {
    if (dep.kind === "actor") {
      lines.push(`    class ${dep.nodeId}["${dep.name}"]:::actor {`)
      lines.push(`        <<actor>>`)
      lines.push(`    }`)
    } else {
      lines.push(`    class ${dep.nodeId}["${dep.name}"]:::component`)
    }
  }

  for (const { fromNodeId, toNodeId } of depArrows) {
    lines.push(`    ${fromNodeId} ..> ${toNodeId}`)
  }

  const idToUuid: Record<string, string> = { [component.id]: component.uuid }
  for (const dep of dependentParticipants.values()) {
    idToUuid[dep.nodeId] = dep.uuid
  }
  for (const nodeId of Object.keys(idToUuid)) {
    lines.push(`    click ${nodeId} call __integraNavigate("${nodeId}")`)
  }

  return { mermaidContent: lines.join("\n"), idToUuid }
}
