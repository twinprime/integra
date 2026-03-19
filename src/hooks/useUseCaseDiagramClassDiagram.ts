import { useCallback } from 'react'
import type { ComponentNode, UseCaseDiagramNode } from '../store/types'
import { buildUseCaseDiagramClassDiagram } from '../utils/useCaseDiagramClassDiagram'
import { useMermaidClassDiagram } from './useMermaidClassDiagram'
import { useSystemStore } from '../store/useSystemStore'

export function useUseCaseDiagramClassDiagram(useCaseDiagramNode: UseCaseDiagramNode | null) {
    const showInterfaces = useSystemStore((s) => s.showGeneratedClassDiagramInterfaces)
    const buildDiagram = useCallback(
        (node: UseCaseDiagramNode, rootComponent: ComponentNode) =>
            buildUseCaseDiagramClassDiagram(node, rootComponent, { showInterfaces }),
        [showInterfaces]
    )

    return useMermaidClassDiagram(buildDiagram, useCaseDiagramNode, 'uc-diagram-class')
}
