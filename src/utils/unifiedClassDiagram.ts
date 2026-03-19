import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { collectAllDiagrams, findNode, findParentNode } from '../nodes/nodeTree'
import { findOwnerActorOrComponentUuidById } from './diagramResolvers'
import { flattenMessages, type SeqAst } from '../parser/sequenceDiagram/visitor'
import { getCachedSeqAst } from './seqAstCache'
import { findNodeByPath, getAncestorComponentChain } from './nodeUtils'
import { collectReferencedSequenceDiagrams } from './referencedSequenceDiagrams'
import { getInterfaceDiagramNodeId } from './classDiagramNodeIds'
import { emitInterfaceClass, emitParticipantClass } from './classDiagramRendering'
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

type ComponentVisibilityConfig = {
    rootComponent: ComponentNode
    ownerComponent: ComponentNode
    includeOwner: boolean
}

type SharedBuilderConfig = ComponentVisibilityConfig & {
    startDiagrams: ReadonlyArray<SequenceDiagramNode>
    alwaysIncludeComponentUuids?: ReadonlyArray<string>
    subjectComponentUuid?: string
    options?: ClassDiagramRenderOptions
}

type SequenceDiagramSources = Map<string, { uuid: string; name: string }>

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

function isVisibleComponentUuid(
    config: ComponentVisibilityConfig,
    candidateUuid: string,
    ownerAncestors: Set<string>
): boolean {
    const { rootComponent, ownerComponent, includeOwner } = config
    if (includeOwner && candidateUuid === ownerComponent.uuid) return true

    const parent = findParentNode(rootComponent, candidateUuid)
    if (parent?.type !== 'component') return false
    if (parent.uuid === ownerComponent.uuid) return true
    if (ownerAncestors.has(candidateUuid)) return true
    return ownerAncestors.has(parent.uuid)
}

function getVisibleRepresentativeUuid(
    config: ComponentVisibilityConfig,
    actualUuid: string,
    ownerAncestors: Set<string>
): string | undefined {
    let currentUuid: string | undefined = actualUuid
    while (currentUuid) {
        const node = findNode([config.rootComponent], currentUuid)
        if (node?.type !== 'component') return undefined
        if (isVisibleComponentUuid(config, currentUuid, ownerAncestors)) return currentUuid

        const parent = findParentNode(config.rootComponent, currentUuid)
        currentUuid = parent?.type === 'component' ? parent.uuid : undefined
    }
    return undefined
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

    const ensureInterfaceNode = (
        componentUuid: string,
        interfaceId: string
    ): ClassDiagramNodeDefinition | null => {
        const componentNode = findNode([rootComponent], componentUuid)
        if (componentNode?.type !== 'component') return null
        const iface = componentNode.interfaces.find((candidate) => candidate.id === interfaceId)
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
        sequenceDiagram: SequenceDiagramNode
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
            const senderUuid = aliasToUuid.get(message.from)
            const receiverUuid = aliasToUuid.get(message.to)
            const visibleSenderUuid = senderUuid
                ? getVisibleRepresentativeUuid(visibilityConfig, senderUuid, ownerAncestors)
                : undefined
            const visibleReceiverUuid = receiverUuid
                ? getVisibleRepresentativeUuid(visibilityConfig, receiverUuid, ownerAncestors)
                : undefined

            if (visibleSenderUuid) ensureComponentNode(visibleSenderUuid)
            if (visibleReceiverUuid) ensureComponentNode(visibleReceiverUuid)

            if (
                !visibleSenderUuid ||
                !visibleReceiverUuid ||
                visibleSenderUuid === visibleReceiverUuid
            ) {
                continue
            }

            const senderNode = findNode([rootComponent], visibleSenderUuid)
            const receiverVisibleNode = findNode([rootComponent], visibleReceiverUuid)
            if (senderNode?.type !== 'component' || receiverVisibleNode?.type !== 'component')
                continue

            if (message.content.kind !== 'functionRef') {
                addDependencyEdge(
                    senderNode.id,
                    receiverVisibleNode.id,
                    senderNode.name,
                    receiverVisibleNode.name,
                    sequenceDiagram
                )
                continue
            }

            const actualReceiverNode = receiverUuid ? findNode([rootComponent], receiverUuid) : null
            if (actualReceiverNode?.type !== 'component') {
                addDependencyEdge(
                    senderNode.id,
                    receiverVisibleNode.id,
                    senderNode.name,
                    receiverVisibleNode.name,
                    sequenceDiagram
                )
                continue
            }

            const { interfaceId, functionId } = message.content
            const visibleReceiverMatchesActual = visibleReceiverUuid === actualReceiverNode.uuid
            const interfaceNode =
                visibleReceiverMatchesActual && options.showInterfaces
                    ? ensureInterfaceNode(actualReceiverNode.uuid, interfaceId)
                    : null

            if (interfaceNode?.kind === 'interface') {
                const calledIds = interfaceMethodIds.get(interfaceNode.nodeId) ?? new Set<string>()
                calledIds.add(functionId)
                interfaceMethodIds.set(interfaceNode.nodeId, calledIds)
                addDependencyEdge(
                    senderNode.id,
                    interfaceNode.nodeId,
                    senderNode.name,
                    interfaceNode.name,
                    sequenceDiagram
                )
                continue
            }

            addDependencyEdge(
                senderNode.id,
                receiverVisibleNode.id,
                senderNode.name,
                receiverVisibleNode.name,
                sequenceDiagram
            )
        }
    }

    if (options.showInterfaces) {
        for (const componentNode of componentNodeMap.values()) {
            if (componentNode.kind !== 'component') continue
            const visibleComponent = findNode([rootComponent], componentNode.uuid)
            if (visibleComponent?.type !== 'component') continue

            for (const iface of visibleComponent.interfaces) {
                const interfaceNode = ensureInterfaceNode(visibleComponent.uuid, iface.id)
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
        ...Array.from(interfaceNodeMap.values(), (node) => ({
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

    return visibleNodeIds
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
        if (node.kind === 'component') {
            emitParticipantClass(
                {
                    nodeId: node.nodeId,
                    name: node.name,
                    kind: 'component',
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
            node.calledFunctionIds ? new Set(node.calledFunctionIds) : undefined
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
            if (node.baseStyle === 'subject') applyComponentStyle(node.nodeId)
            if (node.baseStyle === 'subject-interface') applyInterfaceStyle(node.nodeId)
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
