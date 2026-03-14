import type { ComponentNode, InterfaceSpecification, SequenceDiagramNode } from "../store/types"
import { findNode, findParentNode } from "../nodes/nodeTree"
import { resolveInOwner } from "./diagramResolvers"
import { flattenMessages } from "../parser/sequenceDiagram/visitor"
import { getCachedSeqAst } from "./seqAstCache"
import type { SeqAst } from "../parser/sequenceDiagram/visitor"
import { findNodeByPath, getAncestorComponentChain } from "./nodeUtils"
import { collectAllDiagrams } from "../nodes/nodeTree"
import { buildRootClassDiagram } from "./rootClassDiagram"
import { resolveEffectiveInterfaceFunctions } from "./interfaceFunctions"

type ParticipantKind = "actor" | "component"

type Participant = {
  nodeId: string
  name: string
  uuid: string
  kind: ParticipantKind
}

type ComponentScope = "immediate-sibling" | "ancestor-sibling"

type VisibleParticipants = {
  componentScopes: Map<string, ComponentScope>
  immediateSiblingUuids: Set<string>
  actorUuids: Set<string>
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
  ast: SeqAst,
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

function collectVisibleParticipants(
  component: ComponentNode,
  rootComponent: ComponentNode,
): VisibleParticipants {
  const componentScopes = new Map<string, ComponentScope>()
  const immediateSiblingUuids = new Set<string>()
  const actorUuids = new Set<string>()

  const parentNode = findParentNode(rootComponent, component.uuid)
  const parentComp = parentNode?.type === "component" ? parentNode : null

  for (const sibling of parentComp?.subComponents ?? []) {
    if (sibling.uuid === component.uuid) continue
    immediateSiblingUuids.add(sibling.uuid)
    componentScopes.set(sibling.uuid, "immediate-sibling")
  }

  for (const actor of parentComp?.actors ?? []) {
    actorUuids.add(actor.uuid)
  }

  for (const ancestor of getAncestorComponentChain(rootComponent, component.uuid)) {
    const ancestorParent = findParentNode(rootComponent, ancestor.uuid)
    const ancestorParentComp = ancestorParent?.type === "component" ? ancestorParent : null
    if (!ancestorParentComp) continue

    for (const sibling of ancestorParentComp.subComponents) {
      if (sibling.uuid === ancestor.uuid || componentScopes.has(sibling.uuid)) continue
      componentScopes.set(sibling.uuid, "ancestor-sibling")
    }
  }

  return { componentScopes, immediateSiblingUuids, actorUuids }
}

function toParticipant(rootComponent: ComponentNode, uuid: string): Participant | null {
  const node = findNode([rootComponent], uuid)
  if (!node || (node.type !== "component" && node.type !== "actor")) return null
  return {
    nodeId: node.id,
    name: node.name,
    uuid,
    kind: node.type,
  }
}

function resolveInboundParticipant(
  senderUuid: string,
  rootComponent: ComponentNode,
  componentScopes: Map<string, ComponentScope>,
  immediateSiblingUuids: Set<string>,
  actorUuids: Set<string>,
): { participant: Participant; isViolation: boolean } | null {
  const senderScope = componentScopes.get(senderUuid)
  if (senderScope) {
    const participant = toParticipant(rootComponent, senderUuid)
    return participant ? { participant, isViolation: senderScope === "ancestor-sibling" } : null
  }

  if (actorUuids.has(senderUuid)) {
    const participant = toParticipant(rootComponent, senderUuid)
    return participant ? { participant, isViolation: false } : null
  }

  const senderNode = findNode([rootComponent], senderUuid)
  if (senderNode?.type !== "component") return null

  const rolledUpSibling = getAncestorComponentChain(rootComponent, senderUuid).find((ancestor) =>
    immediateSiblingUuids.has(ancestor.uuid),
  )
  if (!rolledUpSibling) return null

  const participant = toParticipant(rootComponent, rolledUpSibling.uuid)
  return participant ? { participant, isViolation: false } : null
}

function emitInterfaceClass(
  iface: InterfaceSpecification,
  ownerComponent: ComponentNode,
  rootComponent: ComponentNode,
  lines: string[],
  calledFunctionIds?: Set<string>,
): void {
  lines.push(`    class ${iface.id}["${iface.name}"] {`)
  lines.push(`        <<interface>>`)
  const effectiveFunctions = resolveEffectiveInterfaceFunctions(iface, ownerComponent, rootComponent)
  const fns = calledFunctionIds
    ? effectiveFunctions.filter((fn) => calledFunctionIds.has(fn.id))
    : effectiveFunctions
  for (const fn of fns) {
    const params = fn.parameters
      .map((p) => `${p.name}: ${p.type}${p.required ? "" : "?"}`)
      .join(", ")
    lines.push(`        +${fn.id}(${params})`)
  }
  lines.push(`    }`)
}

// eslint-disable-next-line complexity
export function buildComponentClassDiagram(
  component: ComponentNode,
  rootComponent: ComponentNode,
): { mermaidContent: string; idToUuid: Record<string, string> } {
  if (component.uuid === rootComponent.uuid) {
    return buildRootClassDiagram(rootComponent)
  }

  const { componentScopes, immediateSiblingUuids, actorUuids } = collectVisibleParticipants(component, rootComponent)

  const targetInterfaceIds = new Set((component.interfaces ?? []).map((i) => i.id))

  // dependents: participants that call INTO this component's interfaces
  const dependentParticipants = new Map<string, Participant>()
  const depArrows: Array<{ fromNodeId: string; toNodeId: string; isViolation: boolean }> = []
  const depArrowsSet = new Set<string>()

  // Track which functions are called on own interfaces (for filtering)
  const calledOwnFunctions = new Map<string, Set<string>>() // interfaceId → Set<functionId>

  // dependencies: (receiverUuid → interfaceId → Set<functionId>) that this component calls out to
  const outgoingByReceiver = new Map<string, Map<string, Set<string>>>()
  const receiverParticipants = new Map<string, Participant>()

  for (const { diagram, ownerComponentUuid } of collectAllDiagrams(rootComponent)) {
    if (diagram.type !== "sequence-diagram") continue
    const seqDiagram = diagram as SequenceDiagramNode
    if (!seqDiagram.content?.trim()) continue

    const ownerNode = findNode([rootComponent], ownerComponentUuid)
    const ownerComp = ownerNode?.type === "component" ? (ownerNode) : null

    const ast = getCachedSeqAst(seqDiagram.content)

    const participantsMap = new Map<string, Participant>()
    const aliasToUuid = new Map<string, string>()
    registerParticipants(ast, ownerComp, rootComponent, participantsMap, aliasToUuid)

    const messages = flattenMessages(ast.statements)

    for (const msg of messages) {
      if (msg.content.kind !== "functionRef") continue
      const { interfaceId, functionId } = msg.content

      const senderUuid = aliasToUuid.get(msg.from)
      const receiverUuid = aliasToUuid.get(msg.to)

        // ── Dependents: someone calls INTO this component's interface ──────────
      if (targetInterfaceIds.has(interfaceId) && receiverUuid === component.uuid) {
        if (!senderUuid || senderUuid === component.uuid) continue
        const resolvedSender = resolveInboundParticipant(
          senderUuid,
          rootComponent,
          componentScopes,
          immediateSiblingUuids,
          actorUuids,
        )
        if (!resolvedSender) continue
        const { participant: sender, isViolation } = resolvedSender

        if (!dependentParticipants.has(sender.uuid)) {
          dependentParticipants.set(sender.uuid, sender)
        }
        const arrowKey = `${sender.nodeId}|${interfaceId}`
        if (!depArrowsSet.has(arrowKey)) {
          depArrowsSet.add(arrowKey)
          depArrows.push({
            fromNodeId: sender.nodeId,
            toNodeId: interfaceId,
            isViolation,
          })
        }

        // Track called function on own interface
        if (!calledOwnFunctions.has(interfaceId)) calledOwnFunctions.set(interfaceId, new Set())
        calledOwnFunctions.get(interfaceId)!.add(functionId)
      }

      // ── Dependencies: this component calls OUT to another component ────────
      if (senderUuid === component.uuid && receiverUuid && receiverUuid !== component.uuid) {
        const receiver = participantsMap.get(receiverUuid)
        if (!receiver || receiver.kind !== "component") continue
        if (!componentScopes.has(receiverUuid)) continue

        if (!outgoingByReceiver.has(receiverUuid)) {
          outgoingByReceiver.set(receiverUuid, new Map())
          receiverParticipants.set(receiverUuid, receiver)
        }
        const ifaceMap = outgoingByReceiver.get(receiverUuid)!
        if (!ifaceMap.has(interfaceId)) ifaceMap.set(interfaceId, new Set())
        ifaceMap.get(interfaceId)!.add(functionId)
      }
    }
  }

  const hasOwnInterfaces = (component.interfaces?.length ?? 0) > 0
  const hasDependencies = outgoingByReceiver.size > 0
  if (!hasOwnInterfaces && !hasDependencies && dependentParticipants.size === 0) {
    return { mermaidContent: "", idToUuid: {} }
  }

  const lines: string[] = ["classDiagram"]
  const violationParticipantIds = new Set<string>()

  const addRelationship = (line: string): void => {
    lines.push(line)
  }

  // ── Subject component ──────────────────────────────────────────────────────
  lines.push(`    class ${component.id}["${component.name}"]`)

  // ── Subject's own interfaces ───────────────────────────────────────────────
  for (const iface of component.interfaces ?? []) {
    emitInterfaceClass(iface, component, rootComponent, lines, calledOwnFunctions.get(iface.id))
  }
  for (const iface of component.interfaces ?? []) {
    addRelationship(`    ${component.id} ..|> ${iface.id}`)
  }

  // ── Dependents (callers of this component's interfaces) ───────────────────
  for (const dep of dependentParticipants.values()) {
    if (dep.kind === "actor") {
      lines.push(`    class ${dep.nodeId}["${dep.name}"]:::actor {`)
      lines.push(`        <<actor>>`)
      lines.push(`    }`)
    } else {
      lines.push(`    class ${dep.nodeId}["${dep.name}"]:::component`)
    }
  }
  for (const { fromNodeId, toNodeId, isViolation } of depArrows) {
    addRelationship(`    ${fromNodeId} ..> ${toNodeId}`)
    if (isViolation) violationParticipantIds.add(fromNodeId)
  }

  // ── Dependencies (this component calls out to) ────────────────────────────
  for (const [receiverUuid, ifaceMap] of outgoingByReceiver) {
    const receiver = receiverParticipants.get(receiverUuid)!
    const receiverNode = findNode([rootComponent], receiverUuid) as ComponentNode | null

    let hasInterfaceArrow = false
    for (const [ifaceId, calledFunctionIds] of ifaceMap) {
      const ifaceSpec = receiverNode?.interfaces?.find((i) => i.id === ifaceId)
      if (receiverNode && ifaceSpec) {
        emitInterfaceClass(ifaceSpec, receiverNode, rootComponent, lines, calledFunctionIds)
        addRelationship(`    ${receiver.nodeId} ..|> ${ifaceId}`)
        hasInterfaceArrow = true
      }
      addRelationship(`    ${component.id} ..> ${ifaceId}`)
    }

    lines.push(`    class ${receiver.nodeId}["${receiver.name}"]`)
    // Only draw a direct component arrow when no interface arrow already shows the relationship
    if (!hasInterfaceArrow) {
      addRelationship(`    ${component.id} ..> ${receiver.nodeId}`)
    }
  }

  // ── Click navigation ──────────────────────────────────────────────────────
  const idToUuid: Record<string, string> = { [component.id]: component.uuid }
  for (const dep of dependentParticipants.values()) {
    idToUuid[dep.nodeId] = dep.uuid
  }
  for (const receiver of receiverParticipants.values()) {
    idToUuid[receiver.nodeId] = receiver.uuid
  }
  for (const nodeId of Object.keys(idToUuid)) {
    lines.push(`    click ${nodeId} call __integraNavigate("${nodeId}")`)
  }

  // ── Subject styling (applied after all nodes so style targets exist) ───────
  lines.push(`    style ${component.id} fill:#1d4ed8,stroke:#1e3a5f,color:#ffffff`)
  for (const iface of component.interfaces ?? []) {
    lines.push(`    style ${iface.id} fill:#bfdbfe,stroke:#2563eb,color:#1e3a5f`)
  }
  for (const nodeId of violationParticipantIds) {
    lines.push(`    style ${nodeId} fill:#fee2e2,stroke:#dc2626,color:#7f1d1d`)
  }

  return { mermaidContent: lines.join("\n"), idToUuid }
}
