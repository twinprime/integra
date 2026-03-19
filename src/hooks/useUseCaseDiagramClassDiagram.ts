import type { UseCaseDiagramNode } from '../store/types'
import { buildUseCaseDiagramClassDiagram } from '../utils/useCaseDiagramClassDiagram'
import { useMermaidClassDiagram } from './useMermaidClassDiagram'

export function useUseCaseDiagramClassDiagram(useCaseDiagramNode: UseCaseDiagramNode | null) {
    return useMermaidClassDiagram(
        buildUseCaseDiagramClassDiagram,
        useCaseDiagramNode,
        'uc-diagram-class'
    )
}
