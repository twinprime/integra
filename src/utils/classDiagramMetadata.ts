export type SequenceDiagramSource = {
    uuid: string
    name: string
}

export type ClassDiagramRelationshipMetadata = {
    sequenceDiagrams: SequenceDiagramSource[]
}

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

export function toRelationshipMetadata(
    sourceMap: Map<string, SequenceDiagramSource>
): ClassDiagramRelationshipMetadata | null {
    if (sourceMap.size === 0) return null
    return { sequenceDiagrams: Array.from(sourceMap.values()) }
}
