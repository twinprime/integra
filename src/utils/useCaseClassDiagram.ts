import type { ComponentNode, SequenceDiagramNode, UseCaseNode } from '../store/types'
import { findNode, findOwnerComponentUuid } from '../nodes/nodeTree'
import {
    DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS,
    type ClassDiagramBuildResult,
    type ClassDiagramRenderOptions,
} from './classDiagramMetadata'
import { buildSharedClassDiagram } from './unifiedClassDiagram'

export function buildClassDiagramFromSequenceDiagrams(
    startDiagrams: ReadonlyArray<SequenceDiagramNode>,
    rootComponent: ComponentNode,
    ownerComponent: ComponentNode,
    options: ClassDiagramRenderOptions = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS
): ClassDiagramBuildResult {
    if (startDiagrams.length === 0) {
        return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }
    }

    return buildSharedClassDiagram({
        rootComponent,
        ownerComponent,
        includeOwner: false,
        startDiagrams,
        options,
    })
}

export function buildUseCaseClassDiagram(
    useCaseNode: UseCaseNode,
    rootComponent: ComponentNode,
    options: ClassDiagramRenderOptions = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS
): ClassDiagramBuildResult {
    const ownerComponentUuid =
        findOwnerComponentUuid(rootComponent, useCaseNode.uuid) ??
        useCaseNode.sequenceDiagrams[0]?.ownerComponentUuid
    const ownerNode = ownerComponentUuid ? findNode([rootComponent], ownerComponentUuid) : null
    if (ownerNode?.type !== 'component') {
        return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }
    }

    return buildClassDiagramFromSequenceDiagrams(
        useCaseNode.sequenceDiagrams,
        rootComponent,
        ownerNode,
        options
    )
}
