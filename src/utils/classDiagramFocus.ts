import type { ClassDiagramGraph, ClassDiagramNodeDefinition } from './classDiagramMetadata'

export type EdgeMethodIds = Map<string, Set<string>>

export function getFocusedVisibleNodeIds(
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

export function getFocusedInterfaceMethodIds(
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

export function applyNodeStyles(
    mermaidLines: string[],
    visibleNodes: ClassDiagramNodeDefinition[],
    focusedNodeId: string | null,
    visibleNodeIds: Set<string>
): void {
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
}
