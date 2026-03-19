import type { ComponentNode, UseCaseDiagramNode } from '../store/types'
import { buildClassDiagramFromSequenceDiagrams } from './useCaseClassDiagram'

export function buildUseCaseDiagramClassDiagram(
    useCaseDiagramNode: UseCaseDiagramNode,
    rootComponent: ComponentNode
) {
    return buildClassDiagramFromSequenceDiagrams(
        useCaseDiagramNode.useCases.flatMap((useCase) => useCase.sequenceDiagrams),
        rootComponent
    )
}
