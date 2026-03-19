import type { ComponentNode } from '../store/types'
import {
    DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS,
    type ClassDiagramBuildResult,
    type ClassDiagramRenderOptions,
} from './classDiagramMetadata'
import { buildComponentSharedClassDiagram } from './unifiedClassDiagram'

export function buildComponentClassDiagram(
    component: ComponentNode,
    rootComponent: ComponentNode,
    options: ClassDiagramRenderOptions = DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS
): ClassDiagramBuildResult {
    return buildComponentSharedClassDiagram(component, rootComponent, options)
}
