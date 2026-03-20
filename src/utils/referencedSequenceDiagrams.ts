import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { findNode } from '../nodes/nodeTree'
import { flattenMessages } from '../parser/sequenceDiagram/visitor'
import { getCachedSeqAst } from './seqAstCache'
import {
    resolveSequenceReferenceUuid,
    resolveUseCaseDiagramReferenceUuid,
    resolveUseCaseReferenceUuid,
} from './diagramResolvers'

function visitSequenceDiagramList(
    rootComponent: ComponentNode,
    sequenceDiagrams: ReadonlyArray<SequenceDiagramNode>,
    visited: Set<string>,
    result: SequenceDiagramNode[]
): void {
    for (const referencedSeqDiagram of sequenceDiagrams) {
        visitReferencedSequenceDiagram(rootComponent, referencedSeqDiagram, visited, result)
    }
}

function visitResolvedSequenceReference(
    rootComponent: ComponentNode,
    referencedUuid: string | undefined,
    visited: Set<string>,
    result: SequenceDiagramNode[]
): void {
    if (!referencedUuid) return
    const referencedNode = findNode([rootComponent], referencedUuid)
    if (referencedNode?.type !== 'sequence-diagram') return
    visitReferencedSequenceDiagram(rootComponent, referencedNode, visited, result)
}

function visitResolvedUseCaseReference(
    rootComponent: ComponentNode,
    referencedUuid: string | undefined,
    visited: Set<string>,
    result: SequenceDiagramNode[]
): void {
    if (!referencedUuid) return
    const referencedNode = findNode([rootComponent], referencedUuid)
    if (referencedNode?.type !== 'use-case') return
    visitSequenceDiagramList(rootComponent, referencedNode.sequenceDiagrams, visited, result)
}

function visitResolvedUseCaseDiagramReference(
    rootComponent: ComponentNode,
    referencedUuid: string | undefined,
    visited: Set<string>,
    result: SequenceDiagramNode[]
): void {
    if (!referencedUuid) return
    const referencedNode = findNode([rootComponent], referencedUuid)
    if (referencedNode?.type !== 'use-case-diagram') return
    for (const useCase of referencedNode.useCases) {
        visitSequenceDiagramList(rootComponent, useCase.sequenceDiagrams, visited, result)
    }
}

function visitReferencedSequenceDiagram(
    rootComponent: ComponentNode,
    seqDiagram: SequenceDiagramNode,
    visited: Set<string>,
    result: SequenceDiagramNode[]
): void {
    if (visited.has(seqDiagram.uuid)) return
    visited.add(seqDiagram.uuid)
    result.push(seqDiagram)

    if (!seqDiagram.content?.trim()) return

    const ownerNode = findNode([rootComponent], seqDiagram.ownerComponentUuid)
    const ownerComp = ownerNode?.type === 'component' ? ownerNode : null
    if (!ownerComp) return

    const ast = getCachedSeqAst(seqDiagram.content)
    for (const msg of flattenMessages(ast.statements)) {
        if (msg.content.kind === 'seqDiagramRef') {
            visitResolvedSequenceReference(
                rootComponent,
                resolveSequenceReferenceUuid(
                    msg.content.path,
                    rootComponent,
                    ownerComp,
                    seqDiagram.ownerComponentUuid
                ),
                visited,
                result
            )
            continue
        }

        if (msg.content.kind === 'useCaseDiagramRef') {
            visitResolvedUseCaseDiagramReference(
                rootComponent,
                resolveUseCaseDiagramReferenceUuid(
                    msg.content.path,
                    rootComponent,
                    ownerComp,
                    seqDiagram.ownerComponentUuid
                ),
                visited,
                result
            )
            continue
        }

        if (msg.content.kind !== 'useCaseRef') continue

        visitResolvedUseCaseReference(
            rootComponent,
            resolveUseCaseReferenceUuid(
                msg.content.path,
                rootComponent,
                ownerComp,
                seqDiagram.ownerComponentUuid
            ),
            visited,
            result
        )
    }
}

export function collectReferencedSequenceDiagrams(
    rootComponent: ComponentNode,
    startDiagrams: ReadonlyArray<SequenceDiagramNode>
): SequenceDiagramNode[] {
    const visited = new Set<string>()
    const result: SequenceDiagramNode[] = []

    for (const seqDiagram of startDiagrams) {
        visitReferencedSequenceDiagram(rootComponent, seqDiagram, visited, result)
    }

    return result
}
