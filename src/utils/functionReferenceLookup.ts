import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { collectAllDiagrams, findNode } from '../nodes/nodeTree'
import { flattenMessages } from '../parser/sequenceDiagram/visitor'
import { resolveFunctionReferenceTarget } from './diagramResolvers'
import { getCachedSeqAst } from './seqAstCache'

export type DiagramReference = {
    uuid: string
    name: string
}

export type FunctionReferenceLookup = Map<string, Map<string, DiagramReference[]>>

export function buildFunctionReferenceLookup(
    rootComponent: ComponentNode
): FunctionReferenceLookup {
    const lookup: FunctionReferenceLookup = new Map()
    const sequenceDiagrams = collectAllDiagrams(rootComponent)
        .filter(({ diagram }) => diagram.type === 'sequence-diagram')
        .map(({ diagram }) => diagram as SequenceDiagramNode)

    for (const diagram of sequenceDiagrams) {
        if (!diagram.content.trim()) continue
        const ownerNode = findNode([rootComponent], diagram.ownerComponentUuid)
        if (ownerNode?.type !== 'component') continue

        const ast = getCachedSeqAst(diagram.content)
        for (const message of flattenMessages(ast.statements)) {
            if (message.content.kind !== 'functionRef') continue

            const resolvedTarget = resolveFunctionReferenceTarget(
                rootComponent,
                message.to,
                message.content.interfaceId,
                message.content.functionId
            )
            if (!resolvedTarget) continue

            const interfaceReferences =
                lookup.get(resolvedTarget.interfaceUuid) ?? new Map<string, DiagramReference[]>()
            lookup.set(resolvedTarget.interfaceUuid, interfaceReferences)

            const functionReferences: DiagramReference[] =
                interfaceReferences.get(message.content.functionId) ?? []
            interfaceReferences.set(message.content.functionId, functionReferences)

            if (functionReferences.some((ref) => ref.uuid === diagram.uuid)) continue
            functionReferences.push({ uuid: diagram.uuid, name: diagram.name })
        }
    }

    return lookup
}

export function getInterfaceReferencedFunctionIds(
    lookup: FunctionReferenceLookup,
    interfaceUuid: string
): Set<string> {
    return new Set(lookup.get(interfaceUuid)?.keys() ?? [])
}

export function getFunctionTargetReferences(
    lookup: FunctionReferenceLookup,
    interfaceUuid: string,
    functionId: string
): DiagramReference[] {
    return lookup.get(interfaceUuid)?.get(functionId) ?? []
}
