import type { ComponentNode, UseCaseDiagramNode } from '../store/types'
import {
    DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS,
    type ClassDiagramBuildResult,
    type ClassDiagramRenderOptions,
} from './classDiagramMetadata'
import { buildClassDiagramFromSequenceDiagrams } from './useCaseClassDiagram'
import { findNode } from '../nodes/nodeTree'

export function buildUseCaseDiagramClassDiagram(
    useCaseDiagramNode: UseCaseDiagramNode,
    rootComponent: ComponentNode,
    options: ClassDiagramRenderOptions = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS
): ClassDiagramBuildResult {
    const ownerNode = findNode([rootComponent], useCaseDiagramNode.ownerComponentUuid)
    if (ownerNode?.type !== 'component') {
        return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }
    }

    return buildClassDiagramFromSequenceDiagrams(
        useCaseDiagramNode.useCases.flatMap((useCase) => useCase.sequenceDiagrams),
        rootComponent,
        ownerNode,
        options
    )
}
