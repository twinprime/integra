import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { findNode } from '../nodes/nodeTree'
import { flattenMessages } from '../parser/sequenceDiagram/visitor'
import { getCachedSeqAst } from './seqAstCache'
import { resolveSequenceReferenceUuid, resolveUseCaseReferenceUuid } from './diagramResolvers'

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
            const referencedUuid = resolveSequenceReferenceUuid(
                msg.content.path,
                rootComponent,
                ownerComp,
                seqDiagram.ownerComponentUuid
            )
            if (!referencedUuid) continue
            const referencedNode = findNode([rootComponent], referencedUuid)
            if (referencedNode?.type !== 'sequence-diagram') continue
            visitReferencedSequenceDiagram(rootComponent, referencedNode, visited, result)
            continue
        }

        if (msg.content.kind !== 'useCaseRef') continue

        const referencedUuid = resolveUseCaseReferenceUuid(
            msg.content.path,
            rootComponent,
            ownerComp,
            seqDiagram.ownerComponentUuid
        )
        if (!referencedUuid) continue
        const referencedNode = findNode([rootComponent], referencedUuid)
        if (referencedNode?.type !== 'use-case') continue
        for (const referencedSeqDiagram of referencedNode.sequenceDiagrams) {
            visitReferencedSequenceDiagram(rootComponent, referencedSeqDiagram, visited, result)
        }
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
