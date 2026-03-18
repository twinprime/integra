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
