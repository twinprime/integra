/* eslint-disable max-lines */
import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { findNode, findParentNode } from '../nodes/nodeTree'
import { findOwnerActorOrComponentUuidById } from './diagramResolvers'
import { flattenMessages } from '../parser/sequenceDiagram/visitor'
import { getCachedSeqAst } from './seqAstCache'
import type { SeqAst } from '../parser/sequenceDiagram/visitor'
import { findNodeByPath, getAncestorComponentChain } from './nodeUtils'
import { collectAllDiagrams } from '../nodes/nodeTree'
import { buildRootClassDiagram } from './rootClassDiagram'
import { collectReferencedSequenceDiagrams } from './referencedSequenceDiagrams'
import { getInterfaceDiagramNodeId } from './classDiagramNodeIds'
import { emitInterfaceClass, emitParticipantClass } from './classDiagramRendering'
import {
    addSequenceDiagramSource,
    createDependencyRelationshipMetadata,
    createImplementationRelationshipMetadata,
    createSequenceDiagramSourceMap,
    type ClassDiagramBuildResult,
} from './classDiagramMetadata'
type ParticipantKind = 'actor' | 'component'
type Participant = {
    nodeId: string
    name: string
    uuid: string
    kind: ParticipantKind
}
type SequenceDiagramSources = Map<string, { uuid: string; name: string }>
type ComponentScope = 'immediate-sibling' | 'ancestor-sibling'
type VisibleParticipants = {
    componentScopes: Map<string, ComponentScope>
    immediateSiblingUuids: Set<string>
    actorUuids: Set<string>
    directChildActorUuids: Set<string>
}

type OutgoingDependenciesBySender = Map<string, Map<string, Map<string, Set<string>>>>
type OutgoingSourcesBySender = Map<string, Map<string, Map<string, SequenceDiagramSources>>>

function resolveDeclarationUuid(
    path: string[],
    ownerComp: ComponentNode | null,
    root: ComponentNode
): string | undefined {
    if (path.length === 1) {
        return ownerComp ? findOwnerActorOrComponentUuidById(ownerComp, path[0]) : undefined
    }
    return findNodeByPath(root, path.join('/')) ?? undefined
}

function registerParticipants(
    ast: SeqAst,
    ownerComp: ComponentNode | null,
    root: ComponentNode,
    participantsMap: Map<string, Participant>,
    aliasToUuid: Map<string, string>
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
    rootComponent: ComponentNode
): VisibleParticipants {
    const componentScopes = new Map<string, ComponentScope>()
    const immediateSiblingUuids = new Set<string>()
    const actorUuids = new Set<string>()
    const directChildActorUuids = new Set<string>(
        (component.actors ?? []).map((actor) => actor.uuid)
    )

    const parentNode = findParentNode(rootComponent, component.uuid)
    const parentComp = parentNode?.type === 'component' ? parentNode : null

    for (const sibling of parentComp?.subComponents ?? []) {
        if (sibling.uuid === component.uuid) continue
        immediateSiblingUuids.add(sibling.uuid)
        componentScopes.set(sibling.uuid, 'immediate-sibling')
    }

    for (const actor of parentComp?.actors ?? []) {
        actorUuids.add(actor.uuid)
    }

    for (const ancestor of getAncestorComponentChain(rootComponent, component.uuid)) {
        const ancestorParent = findParentNode(rootComponent, ancestor.uuid)
        const ancestorParentComp = ancestorParent?.type === 'component' ? ancestorParent : null
        if (!ancestorParentComp) continue

        for (const sibling of ancestorParentComp.subComponents) {
            if (sibling.uuid === ancestor.uuid || componentScopes.has(sibling.uuid)) continue
            componentScopes.set(sibling.uuid, 'ancestor-sibling')
        }
    }

    return {
        componentScopes,
        immediateSiblingUuids,
        actorUuids,
        directChildActorUuids,
    }
}

function toParticipant(rootComponent: ComponentNode, uuid: string): Participant | null {
    const node = findNode([rootComponent], uuid)
    if (!node || (node.type !== 'component' && node.type !== 'actor')) return null
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
    actorUuids: Set<string>
): { participant: Participant; isViolation: boolean } | null {
    const senderScope = componentScopes.get(senderUuid)
    if (senderScope) {
        const participant = toParticipant(rootComponent, senderUuid)
        return participant ? { participant, isViolation: senderScope === 'ancestor-sibling' } : null
    }

    if (actorUuids.has(senderUuid)) {
        const participant = toParticipant(rootComponent, senderUuid)
        return participant ? { participant, isViolation: false } : null
    }

    const senderNode = findNode([rootComponent], senderUuid)
    if (senderNode?.type !== 'component') return null

    const rolledUpSibling = getAncestorComponentChain(rootComponent, senderUuid).find((ancestor) =>
        immediateSiblingUuids.has(ancestor.uuid)
    )
    if (!rolledUpSibling) return null

    const participant = toParticipant(rootComponent, rolledUpSibling.uuid)
    return participant ? { participant, isViolation: false } : null
}

function getDirectChildRepresentativeUuid(
    rootComponent: ComponentNode,
    component: ComponentNode,
    participantUuid: string
): string | undefined {
    let currentUuid = participantUuid
    let parent = findParentNode(rootComponent, currentUuid)
    while (parent) {
        if (parent.uuid === component.uuid) return currentUuid
        currentUuid = parent.uuid
        parent = findParentNode(rootComponent, currentUuid)
    }

    return undefined
}

function resolveInternalParticipant(
    component: ComponentNode,
    rootComponent: ComponentNode,
    participantUuid: string
): Participant | null {
    if (participantUuid === component.uuid) return toParticipant(rootComponent, participantUuid)

    const directChildUuid = getDirectChildRepresentativeUuid(
        rootComponent,
        component,
        participantUuid
    )
    if (!directChildUuid || directChildUuid === component.uuid) return null

    return toParticipant(rootComponent, directChildUuid)
}

function findContainedComponent(
    component: ComponentNode,
    rootComponent: ComponentNode,
    participantUuid: string
): ComponentNode | null {
    const node = findNode([rootComponent], participantUuid)
    if (node?.type !== 'component') return null
    if (participantUuid === component.uuid) return component

    const directChildUuid = getDirectChildRepresentativeUuid(
        rootComponent,
        component,
        participantUuid
    )
    return directChildUuid ? node : null
}

function setNestedSource(
    sourcesBySender: OutgoingSourcesBySender,
    senderUuid: string,
    receiverUuid: string,
    interfaceId: string,
    seqDiagram: SequenceDiagramNode
): void {
    if (!sourcesBySender.has(senderUuid)) sourcesBySender.set(senderUuid, new Map())
    const receiverMap = sourcesBySender.get(senderUuid)!
    if (!receiverMap.has(receiverUuid)) receiverMap.set(receiverUuid, new Map())
    const ifaceSources = receiverMap.get(receiverUuid)!
    if (!ifaceSources.has(interfaceId))
        ifaceSources.set(interfaceId, createSequenceDiagramSourceMap())
    addSequenceDiagramSource(ifaceSources.get(interfaceId)!, seqDiagram)
}

// eslint-disable-next-line complexity
export function buildComponentClassDiagram(
    component: ComponentNode,
    rootComponent: ComponentNode
): ClassDiagramBuildResult {
    if (component.uuid === rootComponent.uuid) {
        return buildRootClassDiagram(rootComponent)
    }

    const { componentScopes, immediateSiblingUuids, actorUuids, directChildActorUuids } =
        collectVisibleParticipants(component, rootComponent)
    const subjectParticipant = toParticipant(rootComponent, component.uuid)
    if (!subjectParticipant || subjectParticipant.kind !== 'component') {
        return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }
    }

    const ownInterfacesById = new Map(
        (component.interfaces ?? []).map((iface) => [iface.id, iface])
    )
    const targetInterfaceIds = new Set(ownInterfacesById.keys())

    // dependents: participants that call INTO this component's interfaces
    const dependentParticipants = new Map<string, Participant>()
    const depArrows: Array<{
        fromNodeId: string
        fromName: string
        toNodeId: string
        toName: string
        isViolation: boolean
        sequenceSources: SequenceDiagramSources
    }> = []
    const depArrowsSet = new Set<string>()
    const depArrowSources = new Map<string, SequenceDiagramSources>()

    // Track which functions are called on own interfaces (for filtering)
    const calledOwnFunctions = new Map<string, Set<string>>() // interfaceNodeId → Set<functionId>

    // dependencies: (receiverUuid → interfaceId → Set<functionId>) that this component calls out to
    const visibleParticipants = new Map<string, Participant>()
    const outgoingBySender: OutgoingDependenciesBySender = new Map()
    const outgoingSourcesBySender: OutgoingSourcesBySender = new Map()

    const reachableSequenceDiagrams = collectReferencedSequenceDiagrams(
        rootComponent,
        collectAllDiagrams(rootComponent)
            .filter(({ diagram }) => diagram.type === 'sequence-diagram')
            .map(({ diagram }) => diagram as SequenceDiagramNode)
    )

    for (const seqDiagram of reachableSequenceDiagrams) {
        if (!seqDiagram.content?.trim()) continue

        const ownerNode = findNode([rootComponent], seqDiagram.ownerComponentUuid)
        const ownerComp = ownerNode?.type === 'component' ? ownerNode : null

        const ast = getCachedSeqAst(seqDiagram.content)

        const participantsMap = new Map<string, Participant>()
        const aliasToUuid = new Map<string, string>()
        registerParticipants(ast, ownerComp, rootComponent, participantsMap, aliasToUuid)

        const messages = flattenMessages(ast.statements)

        for (const msg of messages) {
            if (msg.content.kind !== 'functionRef') continue
            const { interfaceId, functionId } = msg.content

            const senderUuid = aliasToUuid.get(msg.from)
            const receiverUuid = aliasToUuid.get(msg.to)
            const containedSenderComponent = senderUuid
                ? findContainedComponent(component, rootComponent, senderUuid)
                : null
            const containedReceiverComponent = receiverUuid
                ? findContainedComponent(component, rootComponent, receiverUuid)
                : null
            const internalSender = senderUuid
                ? resolveInternalParticipant(component, rootComponent, senderUuid)
                : null
            const internalReceiver = receiverUuid
                ? resolveInternalParticipant(component, rootComponent, receiverUuid)
                : null

            // ── Dependents: someone calls INTO this component's interface ───────────
            if (targetInterfaceIds.has(interfaceId) && receiverUuid === component.uuid) {
                const ownInterface = ownInterfacesById.get(interfaceId)
                if (!ownInterface) continue
                const ownInterfaceNodeId = getInterfaceDiagramNodeId(ownInterface)
                let resolvedSender: {
                    participant: Participant
                    isViolation: boolean
                } | null = null
                if (containedSenderComponent && containedSenderComponent.uuid !== component.uuid) {
                    resolvedSender = {
                        participant: subjectParticipant,
                        isViolation: false,
                    }
                } else if (internalSender && internalSender.uuid !== component.uuid) {
                    resolvedSender = { participant: internalSender, isViolation: false }
                } else if (senderUuid && senderUuid !== component.uuid) {
                    resolvedSender = resolveInboundParticipant(
                        senderUuid,
                        rootComponent,
                        componentScopes,
                        immediateSiblingUuids,
                        actorUuids
                    )
                }
                if (!resolvedSender) continue
                const { participant: sender, isViolation } = resolvedSender

                dependentParticipants.set(sender.uuid, sender)
                visibleParticipants.set(sender.uuid, sender)
                const arrowKey = `${sender.nodeId}|${ownInterfaceNodeId}`
                if (!depArrowsSet.has(arrowKey)) {
                    depArrowsSet.add(arrowKey)
                    const sequenceSources = createSequenceDiagramSourceMap()
                    depArrowSources.set(arrowKey, sequenceSources)
                    depArrows.push({
                        fromNodeId: sender.nodeId,
                        fromName: sender.name,
                        toNodeId: ownInterfaceNodeId,
                        toName: ownInterface.name,
                        isViolation,
                        sequenceSources,
                    })
                }
                addSequenceDiagramSource(depArrowSources.get(arrowKey)!, seqDiagram)

                if (!calledOwnFunctions.has(ownInterfaceNodeId))
                    calledOwnFunctions.set(ownInterfaceNodeId, new Set())
                calledOwnFunctions.get(ownInterfaceNodeId)!.add(functionId)
            }

            // ── Dependencies: this component or one of its descendants calls OUT ───
            if (!receiverUuid || receiverUuid === component.uuid) continue
            const senderParticipant =
                senderUuid === component.uuid || containedSenderComponent
                    ? subjectParticipant
                    : internalSender
            if (!senderParticipant) continue

            let receiverParticipant: Participant | null = null
            if (containedReceiverComponent) {
                receiverParticipant = subjectParticipant
            } else if (componentScopes.has(receiverUuid)) {
                receiverParticipant = participantsMap.get(receiverUuid) ?? null
            } else {
                receiverParticipant = internalReceiver
            }

            if (!receiverParticipant || receiverParticipant.kind !== 'component') continue

            if (
                senderParticipant.uuid !== component.uuid ||
                receiverParticipant.uuid !== component.uuid
            ) {
                visibleParticipants.set(receiverParticipant.uuid, receiverParticipant)
            }
            if (
                senderParticipant.uuid !== component.uuid ||
                directChildActorUuids.has(senderParticipant.uuid)
            ) {
                visibleParticipants.set(senderParticipant.uuid, senderParticipant)
            }

            if (!outgoingBySender.has(senderParticipant.uuid))
                outgoingBySender.set(senderParticipant.uuid, new Map())
            const receiverMap = outgoingBySender.get(senderParticipant.uuid)!
            const receiverKey = containedReceiverComponent?.uuid ?? receiverParticipant.uuid
            if (!receiverMap.has(receiverKey)) receiverMap.set(receiverKey, new Map())
            const ifaceMap = receiverMap.get(receiverKey)!
            if (!ifaceMap.has(interfaceId)) ifaceMap.set(interfaceId, new Set())
            ifaceMap.get(interfaceId)!.add(functionId)
            setNestedSource(
                outgoingSourcesBySender,
                senderParticipant.uuid,
                receiverKey,
                interfaceId,
                seqDiagram
            )
        }
    }

    const hasOwnInterfaces = (component.interfaces?.length ?? 0) > 0
    const hasDependencies = outgoingBySender.size > 0
    if (!hasOwnInterfaces && !hasDependencies && dependentParticipants.size === 0) {
        return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }
    }

    const lines: string[] = ['---', 'config:', '  layout: elk', '---', 'classDiagram']
    const violationParticipantIds = new Set<string>()
    const relationshipMetadata: ClassDiagramBuildResult['relationshipMetadata'] = []
    const emittedRealizationRelationships = new Set<string>()

    const addRelationship = (
        line: string,
        metadata: ClassDiagramBuildResult['relationshipMetadata'][number] = null
    ): void => {
        lines.push(line)
        relationshipMetadata.push(metadata)
    }
    const addRealizationRelationship = (
        fromNodeId: string,
        toNodeId: string,
        sourceName: string,
        targetName: string
    ): void => {
        const key = `${fromNodeId}|${toNodeId}`
        if (emittedRealizationRelationships.has(key)) return
        emittedRealizationRelationships.add(key)
        addRelationship(
            `    ${fromNodeId} ..|> ${toNodeId}`,
            createImplementationRelationshipMetadata(sourceName, targetName)
        )
    }

    lines.push(`    class ${component.id}["${component.name}"]`)

    for (const iface of component.interfaces ?? []) {
        const interfaceNodeId = getInterfaceDiagramNodeId(iface)
        emitInterfaceClass(
            iface,
            component,
            rootComponent,
            lines,
            interfaceNodeId,
            calledOwnFunctions.get(interfaceNodeId)
        )
    }
    for (const iface of component.interfaces ?? []) {
        addRealizationRelationship(
            component.id,
            getInterfaceDiagramNodeId(iface),
            component.name,
            iface.name
        )
    }

    for (const participant of visibleParticipants.values()) {
        if (participant.uuid === component.uuid) continue
        emitParticipantClass(participant, lines)
    }

    // ── Dependents (callers of this component's interfaces) ───────────────────
    for (const { fromNodeId, fromName, toNodeId, toName, isViolation } of depArrows) {
        const arrowKey = `${fromNodeId}|${toNodeId}`
        addRelationship(
            `    ${fromNodeId} ..> ${toNodeId}`,
            createDependencyRelationshipMetadata(
                fromName,
                toName,
                depArrowSources.get(arrowKey) ?? createSequenceDiagramSourceMap()
            )
        )
        if (isViolation) violationParticipantIds.add(fromNodeId)
    }

    // ── Dependencies (this component or one of its descendants calls out to) ──
    const emittedReceiverInterfaces = new Set<string>()
    for (const [senderUuid, receiverMap] of outgoingBySender) {
        const sender =
            senderUuid === component.uuid ? subjectParticipant : visibleParticipants.get(senderUuid)
        if (!sender) continue

        for (const [receiverActualUuid, ifaceMap] of receiverMap) {
            const receiverDisplayUuid = findContainedComponent(
                component,
                rootComponent,
                receiverActualUuid
            )
                ? component.uuid
                : receiverActualUuid
            const receiver =
                receiverDisplayUuid === component.uuid
                    ? subjectParticipant
                    : visibleParticipants.get(receiverDisplayUuid)
            if (!receiver) continue
            const receiverNode = findNode(
                [rootComponent],
                receiverActualUuid
            ) as ComponentNode | null

            let hasInterfaceArrow = false
            for (const [ifaceId, calledFunctionIds] of ifaceMap) {
                const ifaceSpec = receiverNode?.interfaces?.find((i) => i.id === ifaceId)
                const emitKey = `${receiverDisplayUuid}|${ifaceId}`
                if (receiverNode && ifaceSpec && !emittedReceiverInterfaces.has(emitKey)) {
                    const interfaceNodeId = getInterfaceDiagramNodeId(ifaceSpec)
                    emittedReceiverInterfaces.add(emitKey)
                    emitInterfaceClass(
                        ifaceSpec,
                        receiverNode,
                        rootComponent,
                        lines,
                        interfaceNodeId,
                        calledFunctionIds
                    )
                    addRealizationRelationship(
                        receiver.nodeId,
                        interfaceNodeId,
                        receiver.name,
                        ifaceSpec.name
                    )
                }
                if (receiverNode && ifaceSpec) hasInterfaceArrow = true
                addRelationship(
                    `    ${sender.nodeId} ..> ${receiverNode && ifaceSpec ? getInterfaceDiagramNodeId(ifaceSpec) : ifaceId}`,
                    createDependencyRelationshipMetadata(
                        sender.name,
                        receiverNode && ifaceSpec ? ifaceSpec.name : ifaceId,
                        outgoingSourcesBySender
                            .get(senderUuid)
                            ?.get(receiverActualUuid)
                            ?.get(ifaceId) ?? createSequenceDiagramSourceMap()
                    )
                )
            }

            if (!hasInterfaceArrow) {
                const receiverSources = createSequenceDiagramSourceMap()
                for (const sourceMap of outgoingSourcesBySender
                    .get(senderUuid)
                    ?.get(receiverActualUuid)
                    ?.values() ?? []) {
                    for (const source of sourceMap.values()) {
                        receiverSources.set(source.uuid, source)
                    }
                }
                addRelationship(
                    `    ${sender.nodeId} ..> ${receiver.nodeId}`,
                    createDependencyRelationshipMetadata(
                        sender.name,
                        receiver.name,
                        receiverSources
                    )
                )
            }
        }
    }

    // ── Click navigation ──────────────────────────────────────────────────────
    const idToUuid: Record<string, string> = { [component.id]: component.uuid }
    for (const participant of visibleParticipants.values()) {
        if (participant.uuid === component.uuid) continue
        idToUuid[participant.nodeId] = participant.uuid
    }
    for (const nodeId of Object.keys(idToUuid)) {
        lines.push(`    click ${nodeId} call __integraNavigate("${nodeId}")`)
    }

    // ── Subject styling (applied after all nodes so style targets exist) ───────
    lines.push(`    style ${component.id} fill:#1d4ed8,stroke:#1e3a5f,color:#ffffff`)
    for (const iface of component.interfaces ?? []) {
        lines.push(
            `    style ${getInterfaceDiagramNodeId(iface)} fill:#bfdbfe,stroke:#2563eb,color:#1e3a5f`
        )
    }
    for (const nodeId of violationParticipantIds) {
        lines.push(`    style ${nodeId} fill:#fee2e2,stroke:#dc2626,color:#7f1d1d`)
    }

    return { mermaidContent: lines.join('\n'), idToUuid, relationshipMetadata }
}
