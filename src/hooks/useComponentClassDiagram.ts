import { useCallback } from 'react'
import { useMermaidClassDiagram } from './useMermaidClassDiagram'
import { buildComponentClassDiagram } from '../utils/componentClassDiagram'
import type { ComponentNode } from '../store/types'
import { useSystemStore } from '../store/useSystemStore'

export function useComponentClassDiagram(componentNode: ComponentNode | null) {
    const showInterfaces = useSystemStore((s) => s.showGeneratedClassDiagramInterfaces)
    const buildDiagram = useCallback(
        (node: ComponentNode, rootComponent: ComponentNode) =>
            buildComponentClassDiagram(node, rootComponent, { showInterfaces }),
        [showInterfaces]
    )

    return useMermaidClassDiagram(buildDiagram, componentNode, 'comp-class')
}
