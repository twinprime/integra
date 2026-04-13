import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { collectAllDiagrams, findNode } from '../nodes/nodeTree'
import { flattenMessages, type SeqAst } from '../parser/sequenceDiagram/visitor'
import { getCachedSeqAst } from './seqAstCache'
import { getAncestorComponentChain } from './nodeUtils'
import { collectReferencedSequenceDiagrams } from './referencedSequenceDiagrams'
import { getInterfaceDiagramNodeId } from './classDiagramNodeIds'
import { resolveDeclarationUuid } from './classDiagramDeclarationResolution'
import {
    resolveFunctionReferenceTarget,
    resolveInheritedAncestorInterfaceOnComponent,
} from './diagramResolvers'
import {
    getVisibleRepresentativeUuid,
    isVisibleActorUuid,
    type ComponentVisibilityConfig,
} from './classDiagramParticipants'
import {
    DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS,
    addSequenceDiagramSource,
    createDependencyRelationshipMetadata,
    createImplementationRelationshipMetadata,
    createSequenceDiagramSourceMap,
    type ClassDiagramGraph,
    type ClassDiagramNodeDefinition,
    type ClassDiagramRenderOptions,
} from './classDiagramMetadata'

export type SharedBuilderConfig = ComponentVisibilityConfig & {
    startDiagrams: ReadonlyArray<SequenceDiagramNode>
    alwaysIncludeComponentUuids?: ReadonlyArray<string>
    subjectComponentUuid?: string
    options?: ClassDiagramRenderOptions
}

type SequenceDiagramSources = Map<string, { uuid: string; name: string }>

export function collectSequenceDiagramsFromComponent(
    component: ComponentNode
): SequenceDiagramNode[] {
    const diagrams = component.useCaseDiagrams.flatMap((useCaseDiagram) =>
        useCaseDiagram.useCases.flatMap((useCase) => useCase.sequenceDiagrams)
    )
    for (const child of component.subComponents) {
        diagrams.push(...collectSequenceDiagramsFromComponent(child))
    }
    return diagrams
}

export function getAllSystemSequenceDiagrams(rootComponent: ComponentNode): SequenceDiagramNode[] {
    return collectAllDiagrams(rootComponent)
        .filter(({ diagram }) => diagram.type === 'sequence-diagram')
        .map(({ diagram }) => diagram as SequenceDiagramNode)
}

// eslint-disable-next-line complexity
export function buildClassDiagramGraph({
    rootComponent,
    ownerComponent,
    includeOwner,
    startDiagrams,
    alwaysIncludeComponentUuids = [],
    subjectComponentUuid,
    options = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS,
}: SharedBuilderConfig): ClassDiagramGraph {
    const visibilityConfig: ComponentVisibilityConfig = {
        rootComponent,
        ownerComponent,
        includeOwner,
    }
    const ownerAncestors = new Set(
        getAncestorComponentChain(rootComponent, ownerComponent.uuid).map(
            (ancestor) => ancestor.uuid
        )
    )

    const componentNodeMap = new Map<string, ClassDiagramNodeDefinition>()
    const actorNodeMap = new Map<string, ClassDiagramNodeDefinition>()
    const interfaceNodeMap = new Map<string, ClassDiagramNodeDefinition>()
    const interfaceMethodIds = new Map<string, Set<string>>()
    const edgeMap = new Map<
        string,
        {
            kind: 'dependency' | 'implementation'
            fromNodeId: string
            toNodeId: string
            sources: SequenceDiagramSources
            sourceName: string
            targetName: string
            calledFunctionIds?: Set<string>
        }
    >()

    const ensureComponentNode = (componentUuid: string): ClassDiagramNodeDefinition | null => {
        const existing = componentNodeMap.get(componentUuid)
        if (existing) return existing

        const componentNode = findNode([rootComponent], componentUuid)
        if (componentNode?.type !== 'component') return null

        const definition: ClassDiagramNodeDefinition = {
            kind: 'component',
            nodeId: componentNode.id,
            uuid: componentNode.uuid,
            name: componentNode.name,
            baseStyle: componentNode.uuid === subjectComponentUuid ? 'subject' : undefined,
        }
        componentNodeMap.set(componentUuid, definition)
        return definition
    }

    const ensureActorNode = (actorUuid: string): ClassDiagramNodeDefinition | null => {
        const existing = actorNodeMap.get(actorUuid)
        if (existing) return existing
        const actorNode = findNode([rootComponent], actorUuid)
        if (actorNode?.type !== 'actor') return null

        const definition: ClassDiagramNodeDefinition = {
            kind: 'actor',
            nodeId: actorNode.id,
            uuid: actorNode.uuid,
            name: actorNode.name,
        }
        actorNodeMap.set(actorUuid, definition)
        return definition
    }

    const getVisibleParticipantUuid = (participantUuid: string): string | undefined => {
        const participantNode = findNode([rootComponent], participantUuid)
        if (participantNode?.type === 'component')
            return getVisibleRepresentativeUuid(visibilityConfig, participantUuid, ownerAncestors)
        if (participantNode?.type === 'actor')
            return isVisibleActorUuid(visibilityConfig, participantUuid, ownerAncestors)
                ? participantUuid
                : undefined
        return undefined
    }

    const ensureParticipantNode = (participantUuid: string): ClassDiagramNodeDefinition | null => {
        const participantNode = findNode([rootComponent], participantUuid)
        if (participantNode?.type === 'component') return ensureComponentNode(participantUuid)
        if (participantNode?.type === 'actor') return ensureActorNode(participantUuid)
        return null
    }

    const ensureInterfaceNode = (
        componentUuid: string,
        interfaceUuid: string
    ): ClassDiagramNodeDefinition | null => {
        const componentNode = findNode([rootComponent], componentUuid)
        if (componentNode?.type !== 'component') return null
        const iface = componentNode.interfaces.find((candidate) => candidate.uuid === interfaceUuid)
        if (!iface) return null

        const interfaceNodeId = getInterfaceDiagramNodeId(iface)
        const existing = interfaceNodeMap.get(interfaceNodeId)
        if (existing) return existing

        const definition: ClassDiagramNodeDefinition = {
            kind: 'interface',
            nodeId: interfaceNodeId,
            name: iface.name,
            iface,
            ownerComponent: componentNode,
            baseStyle:
                componentNode.uuid === subjectComponentUuid ? 'subject-interface' : undefined,
        }
        interfaceNodeMap.set(interfaceNodeId, definition)
        return definition
    }

    const addDependencyEdge = (
        fromNodeId: string,
        toNodeId: string,
        sourceName: string,
        targetName: string,
        sequenceDiagram: SequenceDiagramNode,
        functionId?: string
    ): void => {
        if (fromNodeId === toNodeId) return
        const key = `dependency|${fromNodeId}|${toNodeId}`
        const existing = edgeMap.get(key) ?? {
            kind: 'dependency' as const,
            fromNodeId,
            toNodeId,
            sources: createSequenceDiagramSourceMap(),
            sourceName,
            targetName,
        }
        addSequenceDiagramSource(existing.sources, sequenceDiagram)
        if (functionId) {
            const calledFunctionIds = existing.calledFunctionIds ?? new Set<string>()
            calledFunctionIds.add(functionId)
            existing.calledFunctionIds = calledFunctionIds
        }
        edgeMap.set(key, existing)
    }

    for (const componentUuid of alwaysIncludeComponentUuids) {
        ensureComponentNode(componentUuid)
    }

    const reachableDiagrams = collectReferencedSequenceDiagrams(rootComponent, startDiagrams)
    for (const sequenceDiagram of reachableDiagrams) {
        if (!sequenceDiagram.content?.trim()) continue

        const ownerNode = findNode([rootComponent], sequenceDiagram.ownerComponentUuid)
        const sequenceOwner = ownerNode?.type === 'component' ? ownerNode : null
        if (!sequenceOwner) continue

        const ast: SeqAst = getCachedSeqAst(sequenceDiagram.content)
        const aliasToUuid = new Map<string, string>()
        for (const declaration of ast.declarations) {
            const uuid = resolveDeclarationUuid(declaration.path, sequenceOwner, rootComponent)
            if (uuid) aliasToUuid.set(declaration.id, uuid)
        }

        for (const message of flattenMessages(ast.statements)) {
            if (message.excludeFromDependencies) continue
            const senderUuid = aliasToUuid.get(message.from)
            const receiverUuid = aliasToUuid.get(message.to)
            const visibleSenderUuid = senderUuid ? getVisibleParticipantUuid(senderUuid) : undefined
            const visibleReceiverUuid = receiverUuid
                ? getVisibleParticipantUuid(receiverUuid)
                : undefined
            const senderNodeDefinition = visibleSenderUuid
                ? ensureParticipantNode(visibleSenderUuid)
                : null
            const receiverNodeDefinition = visibleReceiverUuid
                ? ensureParticipantNode(visibleReceiverUuid)
                : null

            if (
                !visibleSenderUuid ||
                !visibleReceiverUuid ||
                !senderNodeDefinition ||
                !receiverNodeDefinition ||
                visibleSenderUuid === visibleReceiverUuid
            ) {
                continue
            }

            if (message.content.kind !== 'functionRef') {
                if (
                    message.content.kind === 'useCaseRef' ||
                    message.content.kind === 'useCaseDiagramRef' ||
                    message.content.kind === 'seqDiagramRef'
                )
                    continue
                addDependencyEdge(
                    senderNodeDefinition.nodeId,
                    receiverNodeDefinition.nodeId,
                    senderNodeDefinition.name,
                    receiverNodeDefinition.name,
                    sequenceDiagram
                )
                continue
            }

            const { interfaceId, functionId } = message.content
            const actualReceiverNode = receiverUuid ? findNode([rootComponent], receiverUuid) : null
            const resolvedTarget =
                actualReceiverNode?.type === 'component'
                    ? resolveFunctionReferenceTarget(
                          rootComponent,
                          actualReceiverNode.id,
                          interfaceId,
                          functionId
                      )
                    : null
            if (!resolvedTarget) {
                addDependencyEdge(
                    senderNodeDefinition.nodeId,
                    receiverNodeDefinition.nodeId,
                    senderNodeDefinition.name,
                    receiverNodeDefinition.name,
                    sequenceDiagram
                )
                continue
            }

            const visibleTargetUuid = getVisibleParticipantUuid(resolvedTarget.componentUuid)
            const visibleTargetNode = visibleTargetUuid
                ? ensureParticipantNode(visibleTargetUuid)
                : null
            if (
                !visibleTargetUuid ||
                !visibleTargetNode ||
                visibleSenderUuid === visibleTargetUuid
            ) {
                continue
            }

            const visibleReceiverMatchesActual = visibleTargetUuid === resolvedTarget.componentUuid
            const interfaceNode =
                visibleReceiverMatchesActual && options.showInterfaces
                    ? ensureInterfaceNode(
                          resolvedTarget.componentUuid,
                          resolvedTarget.interfaceUuid
                      )
                    : null

            if (interfaceNode?.kind === 'interface') {
                const calledIds = interfaceMethodIds.get(interfaceNode.nodeId) ?? new Set<string>()
                calledIds.add(functionId)
                interfaceMethodIds.set(interfaceNode.nodeId, calledIds)
                addDependencyEdge(
                    senderNodeDefinition.nodeId,
                    interfaceNode.nodeId,
                    senderNodeDefinition.name,
                    interfaceNode.name,
                    sequenceDiagram,
                    functionId
                )
                continue
            }

            if (!visibleReceiverMatchesActual && options.showInterfaces) {
                const ancestorIfaceTarget = resolveInheritedAncestorInterfaceOnComponent(
                    resolvedTarget.componentUuid,
                    resolvedTarget.interfaceUuid,
                    functionId,
                    visibleTargetUuid,
                    rootComponent
                )
                if (ancestorIfaceTarget) {
                    const ancestorIfaceNode = ensureInterfaceNode(
                        ancestorIfaceTarget.componentUuid,
                        ancestorIfaceTarget.interfaceUuid
                    )
                    if (ancestorIfaceNode?.kind === 'interface') {
                        const calledIds =
                            interfaceMethodIds.get(ancestorIfaceNode.nodeId) ?? new Set<string>()
                        calledIds.add(functionId)
                        interfaceMethodIds.set(ancestorIfaceNode.nodeId, calledIds)
                        addDependencyEdge(
                            senderNodeDefinition.nodeId,
                            ancestorIfaceNode.nodeId,
                            senderNodeDefinition.name,
                            ancestorIfaceNode.name,
                            sequenceDiagram,
                            functionId
                        )
                        continue
                    }
                }
            }

            addDependencyEdge(
                senderNodeDefinition.nodeId,
                visibleTargetNode.nodeId,
                senderNodeDefinition.name,
                visibleTargetNode.name,
                sequenceDiagram
            )
        }
    }

    const interfaceNodeIdsWithDependencies = new Set<string>()
    for (const edge of edgeMap.values()) {
        if (edge.kind !== 'dependency') continue
        if (interfaceNodeMap.has(edge.fromNodeId))
            interfaceNodeIdsWithDependencies.add(edge.fromNodeId)
        if (interfaceNodeMap.has(edge.toNodeId)) interfaceNodeIdsWithDependencies.add(edge.toNodeId)
    }

    if (options.showInterfaces) {
        for (const componentNode of componentNodeMap.values()) {
            if (componentNode.kind !== 'component') continue
            const visibleComponent = findNode([rootComponent], componentNode.uuid)
            if (visibleComponent?.type !== 'component') continue

            for (const iface of visibleComponent.interfaces) {
                const interfaceNodeId = getInterfaceDiagramNodeId(iface)
                if (!interfaceNodeIdsWithDependencies.has(interfaceNodeId)) continue

                const interfaceNode = interfaceNodeMap.get(interfaceNodeId)
                if (!interfaceNode || interfaceNode.kind !== 'interface') continue
                const key = `implementation|${componentNode.nodeId}|${interfaceNode.nodeId}`
                edgeMap.set(key, {
                    kind: 'implementation',
                    fromNodeId: componentNode.nodeId,
                    toNodeId: interfaceNode.nodeId,
                    sources: createSequenceDiagramSourceMap(),
                    sourceName: componentNode.name,
                    targetName: interfaceNode.name,
                })
            }
        }
    }

    const nodes: ClassDiagramNodeDefinition[] = [
        ...componentNodeMap.values(),
        ...actorNodeMap.values(),
        ...Array.from(interfaceNodeMap.values())
            .filter((node) => interfaceNodeIdsWithDependencies.has(node.nodeId))
            .map((node) => ({
                ...node,
                calledFunctionIds: interfaceMethodIds.has(node.nodeId)
                    ? Array.from(interfaceMethodIds.get(node.nodeId)!)
                    : undefined,
            })),
    ]
    const edges = Array.from(edgeMap.values(), (edge) => ({
        kind: edge.kind,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        calledFunctionIds: edge.calledFunctionIds ? Array.from(edge.calledFunctionIds) : undefined,
        metadata:
            edge.kind === 'implementation'
                ? createImplementationRelationshipMetadata(edge.sourceName, edge.targetName)
                : createDependencyRelationshipMetadata(
                      edge.sourceName,
                      edge.targetName,
                      edge.sources
                  ),
    }))

    const idToUuid: Record<string, string> = {}
    const focusableNodeIds: string[] = []
    for (const node of componentNodeMap.values()) {
        if (node.kind !== 'component') continue
        idToUuid[node.nodeId] = node.uuid
        focusableNodeIds.push(node.nodeId)
    }
    for (const node of actorNodeMap.values()) {
        if (node.kind !== 'actor') continue
        idToUuid[node.nodeId] = node.uuid
    }

    return {
        nodes,
        edges,
        idToUuid,
        focusableNodeIds,
    }
}
