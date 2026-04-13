import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { emitInterfaceClass, emitParticipantClass } from './classDiagramRendering'
import {
    DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS,
    type ClassDiagramBuildResult,
    type ClassDiagramGraph,
    type ClassDiagramRenderOptions,
} from './classDiagramMetadata'
import {
    type SharedBuilderConfig,
    buildClassDiagramGraph,
    collectSequenceDiagramsFromComponent,
    getAllSystemSequenceDiagrams,
} from './classDiagramGraph'
import {
    getFocusedVisibleNodeIds,
    getFocusedInterfaceMethodIds,
    applyNodeStyles,
} from './classDiagramFocus'

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

    applyNodeStyles(mermaidLines, visibleNodes, focusedNodeId, visibleNodeIds)

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
