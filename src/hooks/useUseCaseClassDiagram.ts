import { useCallback } from 'react'
import { useMermaidClassDiagram } from './useMermaidClassDiagram'
import { buildUseCaseClassDiagram } from '../utils/useCaseClassDiagram'
import type { ComponentNode, UseCaseNode } from '../store/types'
import { useSystemStore } from '../store/useSystemStore'

export function useUseCaseClassDiagram(useCaseNode: UseCaseNode | null) {
    const showInterfaces = useSystemStore((s) => s.showGeneratedClassDiagramInterfaces)
    const buildDiagram = useCallback(
        (node: UseCaseNode, rootComponent: ComponentNode) =>
            buildUseCaseClassDiagram(node, rootComponent, { showInterfaces }),
        [showInterfaces]
    )

    return useMermaidClassDiagram(buildDiagram, useCaseNode, 'uc-class')
}
