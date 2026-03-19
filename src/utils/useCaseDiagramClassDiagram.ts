import type { ComponentNode, UseCaseDiagramNode } from '../store/types'
import { buildClassDiagramFromSequenceDiagrams } from './useCaseClassDiagram'
import {
    DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS,
    type ClassDiagramRenderOptions,
} from './classDiagramMetadata'

export function buildUseCaseDiagramClassDiagram(
    useCaseDiagramNode: UseCaseDiagramNode,
    rootComponent: ComponentNode,
    options: ClassDiagramRenderOptions = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS
) {
    return buildClassDiagramFromSequenceDiagrams(
        useCaseDiagramNode.useCases.flatMap((useCase) => useCase.sequenceDiagrams),
        rootComponent,
        options
    )
}
