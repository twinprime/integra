import { useMermaidClassDiagram } from './useMermaidClassDiagram'
import { buildComponentClassDiagram } from '../utils/componentClassDiagram'
import type { ComponentNode } from '../store/types'

export function useComponentClassDiagram(componentNode: ComponentNode | null) {
    return useMermaidClassDiagram(buildComponentClassDiagram, componentNode, 'comp-class')
}
