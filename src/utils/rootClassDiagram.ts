import type { ComponentNode } from '../store/types'
import {
    DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS,
    type ClassDiagramBuildResult,
    type ClassDiagramRenderOptions,
} from './classDiagramMetadata'
import { buildRootSharedClassDiagram } from './unifiedClassDiagram'

export function buildRootClassDiagram(
    rootComponent: ComponentNode,
    options: ClassDiagramRenderOptions = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS
): ClassDiagramBuildResult {
    return buildRootSharedClassDiagram(rootComponent, options)
}
