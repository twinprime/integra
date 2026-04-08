import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { collectAllDiagrams, findNode } from '../nodes/nodeTree'
import { flattenMessages, type SeqAst } from '../parser/sequenceDiagram/visitor'
import { getCachedSeqAst } from './seqAstCache'
import { getAncestorComponentChain } from './nodeUtils'
import { collectReferencedSequenceDiagrams } from './referencedSequenceDiagrams'
import { getInterfaceDiagramNodeId } from './classDiagramNodeIds'
import { emitInterfaceClass, emitParticipantClass } from './classDiagramRendering'
import { resolveDeclarationUuid } from './classDiagramDeclarationResolution'
import { resolveFunctionReferenceTarget } from './diagramResolvers'
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
    type ClassDiagramBuildResult,
    type ClassDiagramGraph,
    type ClassDiagramNodeDefinition,
    type ClassDiagramRenderOptions,
} from './classDiagramMetadata'

type SharedBuilderConfig = ComponentVisibilityConfig & {
    startDiagrams: ReadonlyArray<SequenceDiagramNode>
    alwaysIncludeComponentUuids?: ReadonlyArray<string>
    subjectComponentUuid?: string
    options?: ClassDiagramRenderOptions
}

type SequenceDiagramSources = Map<string, { uuid: string; name: string }>
type EdgeMethodIds = Map<string, Set<string>>

function collectSequenceDiagramsFromComponent(component: ComponentNode): SequenceDiagramNode[] {
    const diagrams = component.useCaseDiagrams.flatMap((useCaseDiagram) =>
        useCaseDiagram.useCases.flatMap((useCase) => useCase.sequenceDiagrams)
    )
    for (const child of component.subComponents) {
        diagrams.push(...collectSequenceDiagramsFromComponent(child))
    }
    return diagrams
}

function getAllSystemSequenceDiagrams(rootComponent: ComponentNode): SequenceDiagramNode[] {
    return collectAllDiagrams(rootComponent)
        .filter(({ diagram }) => diagram.type === 'sequence-diagram')
        .map(({ diagram }) => diagram as SequenceDiagramNode)
}

// eslint-disable-next-line complexity
function buildClassDiagramGraph({
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
            const resolvedTarget = resolveFunctionReferenceTarget(
                rootComponent,
                message.to,
                interfaceId,
                functionId
            )
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

function getFocusedVisibleNodeIds(
    graph: ClassDiagramGraph,
    focusedNodeId: string | null
): Set<string> | null {
    if (!focusedNodeId) return null

    const focusedNode = graph.nodes.find(
        (node) => node.kind === 'component' && node.nodeId === focusedNodeId
    )
    if (!focusedNode || focusedNode.kind !== 'component') return null

    const visibleNodeIds = new Set<string>([focusedNodeId])
    const seedNodeIds = new Set<string>([focusedNodeId])

    for (const node of graph.nodes) {
        if (node.kind === 'interface' && node.ownerComponent.id === focusedNode.nodeId) {
            visibleNodeIds.add(node.nodeId)
            seedNodeIds.add(node.nodeId)
        }
    }

    for (const edge of graph.edges) {
        if (seedNodeIds.has(edge.fromNodeId) || seedNodeIds.has(edge.toNodeId)) {
            visibleNodeIds.add(edge.fromNodeId)
            visibleNodeIds.add(edge.toNodeId)
        }
    }

    for (const node of graph.nodes) {
        if (node.kind === 'interface' && visibleNodeIds.has(node.nodeId)) {
            visibleNodeIds.add(node.ownerComponent.id)
        }
    }

    return visibleNodeIds
}

function getFocusedInterfaceMethodIds(
    graph: ClassDiagramGraph,
    focusedNodeId: string,
    visibleNodeIds: Set<string>
): EdgeMethodIds {
    const focusedInterfaceMethodIds: EdgeMethodIds = new Map()

    for (const edge of graph.edges) {
        if (
            edge.kind !== 'dependency' ||
            !edge.calledFunctionIds ||
            !visibleNodeIds.has(edge.fromNodeId) ||
            !visibleNodeIds.has(edge.toNodeId)
        ) {
            continue
        }

        const targetNode = graph.nodes.find(
            (node) => node.kind === 'interface' && node.nodeId === edge.toNodeId
        )
        if (!targetNode || targetNode.kind !== 'interface') continue

        const isFocusedOwnInterface = targetNode.ownerComponent.id === focusedNodeId
        const isFocusedDependencyInterface = edge.fromNodeId === focusedNodeId
        if (!isFocusedOwnInterface && !isFocusedDependencyInterface) continue

        const calledIds = focusedInterfaceMethodIds.get(targetNode.nodeId) ?? new Set<string>()
        for (const functionId of edge.calledFunctionIds) calledIds.add(functionId)
        focusedInterfaceMethodIds.set(targetNode.nodeId, calledIds)
    }

    return focusedInterfaceMethodIds
}

export function renderClassDiagramGraph(
    graph: ClassDiagramGraph,
    rootComponent: ComponentNode,
    focusedNodeId: string | null = null
): Omit<ClassDiagramBuildResult, 'graph'> {
    const focusedVisibleNodeIds = getFocusedVisibleNodeIds(graph, focusedNodeId)
    const visibleNodes = focusedVisibleNodeIds
        ? graph.nodes.filter((node) => focusedVisibleNodeIds.has(node.nodeId))
        : graph.nodes
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.nodeId))
    const focusedInterfaceMethodIds =
        focusedNodeId && focusedVisibleNodeIds
            ? getFocusedInterfaceMethodIds(graph, focusedNodeId, visibleNodeIds)
            : null
    const visibleEdges = graph.edges.filter(
        (edge) => visibleNodeIds.has(edge.fromNodeId) && visibleNodeIds.has(edge.toNodeId)
    )

    if (!visibleNodes.some((node) => node.kind === 'component')) {
        return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }
    }

    const mermaidLines: string[] = ['---', 'config:', '  layout: elk', '---', 'classDiagram']
    const relationshipMetadata: ClassDiagramBuildResult['relationshipMetadata'] = []
    const visibleIdToUuid: Record<string, string> = {}

    const addRelationship = (
        line: string,
        metadata: ClassDiagramBuildResult['relationshipMetadata'][number]
    ) => {
        mermaidLines.push(line)
        relationshipMetadata.push(metadata)
    }

    for (const node of visibleNodes) {
        if (node.kind !== 'interface') {
            emitParticipantClass(
                {
                    nodeId: node.nodeId,
                    name: node.name,
                    kind: node.kind,
                },
                mermaidLines
            )
            visibleIdToUuid[node.nodeId] = node.uuid
            continue
        }

        emitInterfaceClass(
            node.iface,
            node.ownerComponent,
            rootComponent,
            mermaidLines,
            node.nodeId,
            focusedInterfaceMethodIds?.get(node.nodeId) ??
                (node.calledFunctionIds ? new Set(node.calledFunctionIds) : undefined)
        )
    }

    for (const edge of visibleEdges) {
        addRelationship(
            `    ${edge.fromNodeId} ${edge.kind === 'implementation' ? '..|>' : '..>'} ${edge.toNodeId}`,
            edge.metadata
        )
    }

    for (const nodeId of Object.keys(visibleIdToUuid)) {
        mermaidLines.push(`    click ${nodeId} call __integraNavigate("${nodeId}")`)
    }

    const applyComponentStyle = (nodeId: string) => {
        mermaidLines.push(`    style ${nodeId} fill:#1d4ed8,stroke:#1e3a5f,color:#ffffff`)
    }
    const applyInterfaceStyle = (nodeId: string) => {
        mermaidLines.push(`    style ${nodeId} fill:#bfdbfe,stroke:#2563eb,color:#1e3a5f`)
    }

    if (focusedNodeId && visibleNodeIds.has(focusedNodeId)) {
        applyComponentStyle(focusedNodeId)
        for (const node of visibleNodes) {
            if (node.kind === 'interface' && node.ownerComponent.id === focusedNodeId) {
                applyInterfaceStyle(node.nodeId)
            }
        }
    } else {
        for (const node of visibleNodes) {
            if (node.kind === 'component' && node.baseStyle === 'subject')
                applyComponentStyle(node.nodeId)
            if (node.kind === 'interface' && node.baseStyle === 'subject-interface')
                applyInterfaceStyle(node.nodeId)
        }
    }

    return {
        mermaidContent: mermaidLines.join('\n'),
        idToUuid: visibleIdToUuid,
        relationshipMetadata,
    }
}

export function buildSharedClassDiagram(config: SharedBuilderConfig): ClassDiagramBuildResult {
    const graph = buildClassDiagramGraph(config)
    const rendered = renderClassDiagramGraph(graph, config.rootComponent)
    return {
        ...rendered,
        graph,
    }
}

export function buildRootSharedClassDiagram(
    rootComponent: ComponentNode,
    options: ClassDiagramRenderOptions = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS
): ClassDiagramBuildResult {
    if (rootComponent.subComponents.length === 0) {
        return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }
    }

    return buildSharedClassDiagram({
        rootComponent,
        ownerComponent: rootComponent,
        includeOwner: false,
        startDiagrams: getAllSystemSequenceDiagrams(rootComponent),
        alwaysIncludeComponentUuids: rootComponent.subComponents.map((component) => component.uuid),
        options,
    })
}

export function buildComponentSharedClassDiagram(
    component: ComponentNode,
    rootComponent: ComponentNode,
    options: ClassDiagramRenderOptions = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS
): ClassDiagramBuildResult {
    return buildSharedClassDiagram({
        rootComponent,
        ownerComponent: component,
        includeOwner: true,
        startDiagrams:
            component.uuid === rootComponent.uuid
                ? getAllSystemSequenceDiagrams(rootComponent)
                : collectSequenceDiagramsFromComponent(component),
        subjectComponentUuid: component.uuid,
        alwaysIncludeComponentUuids:
            component.uuid === rootComponent.uuid
                ? rootComponent.subComponents.map((candidate) => candidate.uuid)
                : [],
        options,
    })
}

export function collectComponentOwnedSequenceDiagrams(
    component: ComponentNode
): SequenceDiagramNode[] {
    return collectSequenceDiagramsFromComponent(component)
}
