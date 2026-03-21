import type { ComponentNode, InterfaceSpecification } from '../store/types'

export type SequenceDiagramSource = {
    uuid: string
    name: string
}

type ClassDiagramRelationshipBase = {
    sourceName: string
    targetName: string
}

export type DependencyRelationshipMetadata = ClassDiagramRelationshipBase & {
    kind: 'dependency'
    sequenceDiagrams: SequenceDiagramSource[]
}

export type ImplementationRelationshipMetadata = ClassDiagramRelationshipBase & {
    kind: 'implementation'
    sequenceDiagrams: SequenceDiagramSource[]
}

export type ClassDiagramRelationshipMetadata =
    | DependencyRelationshipMetadata
    | ImplementationRelationshipMetadata

export type ClassDiagramBuildResult = {
    mermaidContent: string
    idToUuid: Record<string, string>
    relationshipMetadata: Array<ClassDiagramRelationshipMetadata | null>
    graph?: ClassDiagramGraph
}

export type ClassDiagramRenderOptions = {
    showInterfaces: boolean
}

export const DEFAULT_CLASS_DIAGRAM_RENDER_OPTIONS: ClassDiagramRenderOptions = {
    showInterfaces: true,
}

export type ClassDiagramNodeDefinition =
    | {
          kind: 'component'
          nodeId: string
          uuid: string
          name: string
          baseStyle?: 'subject'
      }
    | {
          kind: 'actor'
          nodeId: string
          uuid: string
          name: string
      }
    | {
          kind: 'interface'
          nodeId: string
          name: string
          iface: InterfaceSpecification
          ownerComponent: ComponentNode
          calledFunctionIds?: string[]
          baseStyle?: 'subject-interface'
      }

export type ClassDiagramEdgeDefinition = {
    kind: 'dependency' | 'implementation'
    fromNodeId: string
    toNodeId: string
    metadata: ClassDiagramRelationshipMetadata | null
}

export type ClassDiagramGraph = {
    nodes: ClassDiagramNodeDefinition[]
    edges: ClassDiagramEdgeDefinition[]
    idToUuid: Record<string, string>
    focusableNodeIds: string[]
}

type SequenceDiagramLike = {
    uuid: string
    name: string
}

export function createSequenceDiagramSourceMap(): Map<string, SequenceDiagramSource> {
    return new Map()
}

export function addSequenceDiagramSource(
    target: Map<string, SequenceDiagramSource>,
    diagram: SequenceDiagramLike
): void {
    target.set(diagram.uuid, { uuid: diagram.uuid, name: diagram.name })
}

export function createDependencyRelationshipMetadata(
    sourceName: string,
    targetName: string,
    sourceMap: Map<string, SequenceDiagramSource>
): DependencyRelationshipMetadata | null {
    if (sourceMap.size === 0) return null
    return {
        kind: 'dependency',
        sourceName,
        targetName,
        sequenceDiagrams: Array.from(sourceMap.values()),
    }
}

export function createImplementationRelationshipMetadata(
    sourceName: string,
    targetName: string
): ImplementationRelationshipMetadata {
    return {
        kind: 'implementation',
        sourceName,
        targetName,
        sequenceDiagrams: [],
    }
}
