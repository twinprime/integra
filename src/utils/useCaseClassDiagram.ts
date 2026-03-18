import type { ComponentNode, UseCaseNode } from '../store/types'
import { findNode } from '../nodes/nodeTree'
import { findOwnerActorOrComponentUuidById } from './diagramResolvers'
import { flattenMessages } from '../parser/sequenceDiagram/visitor'
import type { SeqAst } from '../parser/sequenceDiagram/visitor'
import { getCachedSeqAst } from './seqAstCache'
import { findNodeByPath } from './nodeUtils'
import { collectReferencedSequenceDiagrams } from './referencedSequenceDiagrams'
import { getInterfaceDiagramNodeId } from './classDiagramNodeIds'
import { emitParticipantClass } from './classDiagramRendering'
import {
    addSequenceDiagramSource,
    createDependencyRelationshipMetadata,
    createImplementationRelationshipMetadata,
    createSequenceDiagramSourceMap,
    type ClassDiagramBuildResult,
} from './classDiagramMetadata'

type ParticipantKind = 'actor' | 'component'

type Participant = {
    nodeId: string
    name: string
    uuid: string
    kind: ParticipantKind
}

type Arrow = {
    fromNodeId: string
    fromName: string
    toNodeId: string
    toName: string
    sequenceSources: Map<string, { uuid: string; name: string }>
}
type InterfaceEntry = {
    componentNodeId: string
    componentName: string
    interfaceNodeId: string
    interfaceName: string
}

type ClassDiagramState = {
    interfacesSet: Set<string>
    interfaces: InterfaceEntry[]
    interfaceMethods: Map<string, Set<string>>
    depsSet: Set<string>
    deps: Arrow[]
    directArrows: Arrow[]
}

function parseAst(content: string): SeqAst {
    return getCachedSeqAst(content)
}

/** Resolves a declaration's UUID using its path segments and owner component. */
function resolveDeclarationUuid(
    path: string[],
    ownerComp: ComponentNode | null,
    root: ComponentNode
): string | undefined {
    if (path.length === 1) {
        return ownerComp ? findOwnerActorOrComponentUuidById(ownerComp, path[0]) : undefined
    }
    return findNodeByPath(root, path.join('/')) ?? undefined
}

function registerParticipants(
    ast: SeqAst,
    ownerComp: ComponentNode | null,
    rootComponent: ComponentNode,
    participantsMap: Map<string, Participant>,
    aliasToUuid: Map<string, string>
): void {
    for (const decl of ast.declarations) {
        const uuid = resolveDeclarationUuid(decl.path, ownerComp, rootComponent)
        if (!uuid) continue
        // Map the effective participant id (alias or last path segment) → uuid for message lookups
        aliasToUuid.set(decl.id, uuid)
        if (participantsMap.has(uuid)) continue
        const node = findNode([rootComponent], uuid)
        if (!node) continue
        participantsMap.set(uuid, {
            nodeId: node.id,
            name: node.name,
            uuid,
            kind: decl.entityType,
        })
    }
}

function processMessages(
    ast: SeqAst,
    aliasToUuid: Map<string, string>,
    participantsMap: Map<string, Participant>,
    rootComponent: ComponentNode,
    state: ClassDiagramState,
    seqDiagram: { uuid: string; name: string }
): void {
    const messages = flattenMessages(ast.statements)

    for (const msg of messages) {
        if (msg.content.kind === 'functionRef') {
            const { interfaceId, functionId, rawParams } = msg.content
            const receiverUuid = aliasToUuid.get(msg.to)
            const receiverNode = receiverUuid ? findNode([rootComponent], receiverUuid) : null
            const receiverInterface =
                receiverNode?.type === 'component'
                    ? receiverNode.interfaces.find((iface) => iface.id === interfaceId)
                    : undefined
            if (!receiverInterface) continue
            const interfaceNodeId = getInterfaceDiagramNodeId(receiverInterface)

            if (!state.interfaceMethods.has(interfaceNodeId))
                state.interfaceMethods.set(interfaceNodeId, new Set())
            state.interfaceMethods.get(interfaceNodeId)!.add(`${functionId}(${rawParams})`)

            const senderUuid = aliasToUuid.get(msg.from)
            const sender = senderUuid ? participantsMap.get(senderUuid) : undefined
            if (sender) {
                const key = `dep|${sender.nodeId}|${interfaceNodeId}`
                if (!state.depsSet.has(key)) {
                    state.depsSet.add(key)
                    state.deps.push({
                        fromNodeId: sender.nodeId,
                        fromName: sender.name,
                        toNodeId: interfaceNodeId,
                        toName: receiverInterface.name,
                        sequenceSources: createSequenceDiagramSourceMap(),
                    })
                }
                addSequenceDiagramSource(
                    state.deps.find(
                        (dep) =>
                            dep.fromNodeId === sender.nodeId && dep.toNodeId === interfaceNodeId
                    )!.sequenceSources,
                    seqDiagram
                )
            }

            const ownerComp = receiverUuid ? participantsMap.get(receiverUuid) : undefined
            if (ownerComp) {
                const key = `iface|${ownerComp.nodeId}|${interfaceNodeId}`
                if (!state.interfacesSet.has(key)) {
                    state.interfacesSet.add(key)
                    state.interfaces.push({
                        componentNodeId: ownerComp.nodeId,
                        componentName: ownerComp.name,
                        interfaceNodeId,
                        interfaceName: receiverInterface.name,
                    })
                }
            }
        } else {
            // Direct arrow (label-only or bare message)
            if (msg.from === msg.to) continue
            const senderUuid = aliasToUuid.get(msg.from)
            const receiverUuid = aliasToUuid.get(msg.to)
            const sender = senderUuid ? participantsMap.get(senderUuid) : undefined
            const receiver = receiverUuid ? participantsMap.get(receiverUuid) : undefined
            if (sender && receiver) {
                const key = `direct|${sender.nodeId}|${receiver.nodeId}`
                if (!state.depsSet.has(key)) {
                    state.depsSet.add(key)
                    state.directArrows.push({
                        fromNodeId: sender.nodeId,
                        fromName: sender.name,
                        toNodeId: receiver.nodeId,
                        toName: receiver.name,
                        sequenceSources: createSequenceDiagramSourceMap(),
                    })
                }
                addSequenceDiagramSource(
                    state.directArrows.find(
                        (arrow) =>
                            arrow.fromNodeId === sender.nodeId && arrow.toNodeId === receiver.nodeId
                    )!.sequenceSources,
                    seqDiagram
                )
            }
        }
    }
}

function buildMermaidLines(
    participantsMap: Map<string, Participant>,
    state: ClassDiagramState,
    idToUuid: Record<string, string>
): ClassDiagramBuildResult {
    const { interfaces, interfaceMethods, deps, directArrows } = state
    const lines: string[] = ['---', 'config:', '  layout: elk', '---', 'classDiagram']
    const relationshipMetadata: ClassDiagramBuildResult['relationshipMetadata'] = []

    const addRelationship = (
        line: string,
        metadata: ClassDiagramBuildResult['relationshipMetadata'][number] = null
    ): void => {
        lines.push(line)
        relationshipMetadata.push(metadata)
    }

    for (const p of participantsMap.values()) {
        emitParticipantClass(p, lines)
        if (p.kind === 'component') {
            lines[lines.length - 1] = `    class ${p.nodeId}["${p.name}"]:::component`
        }
    }

    for (const { interfaceNodeId, interfaceName } of interfaces) {
        lines.push(`    class ${interfaceNodeId}["${interfaceName}"] {`)
        lines.push(`        <<interface>>`)
        for (const method of interfaceMethods.get(interfaceNodeId) ?? []) {
            lines.push(`        +${method}`)
        }
        lines.push(`    }`)
    }

    for (const { componentNodeId, componentName, interfaceNodeId, interfaceName } of interfaces) {
        addRelationship(
            `    ${componentNodeId} ..|> ${interfaceNodeId}`,
            createImplementationRelationshipMetadata(componentName, interfaceName)
        )
    }
    for (const { fromNodeId, fromName, toNodeId, toName, sequenceSources } of deps) {
        addRelationship(
            `    ${fromNodeId} ..> ${toNodeId}`,
            createDependencyRelationshipMetadata(fromName, toName, sequenceSources)
        )
    }
    for (const { fromNodeId, fromName, toNodeId, toName, sequenceSources } of directArrows) {
        addRelationship(
            `    ${fromNodeId} ..> ${toNodeId}`,
            createDependencyRelationshipMetadata(fromName, toName, sequenceSources)
        )
    }

    for (const nodeId of Object.keys(idToUuid)) {
        lines.push(`    click ${nodeId} call __integraNavigate("${nodeId}")`)
    }
    return { mermaidContent: lines.join('\n'), idToUuid, relationshipMetadata }
}

export function buildUseCaseClassDiagram(
    useCaseNode: UseCaseNode,
    rootComponent: ComponentNode
): ClassDiagramBuildResult {
    const participantsMap = new Map<string, Participant>()
    const state: ClassDiagramState = {
        interfacesSet: new Set(),
        interfaces: [],
        interfaceMethods: new Map(),
        depsSet: new Set(),
        deps: [],
        directArrows: [],
    }

    for (const seqDiagram of collectReferencedSequenceDiagrams(
        rootComponent,
        useCaseNode.sequenceDiagrams
    )) {
        if (!seqDiagram.content?.trim()) continue
        const ownerNode = findNode([rootComponent], seqDiagram.ownerComponentUuid)
        const ownerComp = ownerNode?.type === 'component' ? ownerNode : null
        const aliasToUuid = new Map<string, string>()
        const ast = parseAst(seqDiagram.content)
        registerParticipants(ast, ownerComp, rootComponent, participantsMap, aliasToUuid)
        processMessages(ast, aliasToUuid, participantsMap, rootComponent, state, seqDiagram)
    }

    if (participantsMap.size === 0) {
        return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }
    }

    const idToUuid: Record<string, string> = {}
    for (const p of participantsMap.values()) {
        idToUuid[p.nodeId] = p.uuid
    }

    return buildMermaidLines(participantsMap, state, idToUuid)
}
