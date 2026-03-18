import type { ComponentNode, InterfaceSpecification, SequenceDiagramNode } from '../store/types'
import { findNode, findParentNode } from '../nodes/nodeTree'
import { findOwnerActorOrComponentUuidById } from './diagramResolvers'
import { flattenMessages } from '../parser/sequenceDiagram/visitor'
import { getCachedSeqAst } from './seqAstCache'
import type { SeqAst } from '../parser/sequenceDiagram/visitor'
import { findNodeByPath } from './nodeUtils'
import { collectAllDiagrams } from '../nodes/nodeTree'
import { resolveEffectiveInterfaceFunctions } from './interfaceFunctions'
import { collectReferencedSequenceDiagrams } from './referencedSequenceDiagrams'
import {
    addSequenceDiagramSource,
    createSequenceDiagramSourceMap,
    toRelationshipMetadata,
    type ClassDiagramBuildResult,
} from './classDiagramMetadata'

type ParticipantKind = 'actor' | 'component'

type Participant = {
    nodeId: string
    name: string
    uuid: string
    kind: ParticipantKind
}

function toParticipant(rootComponent: ComponentNode, uuid: string): Participant | null {
    const node = findNode([rootComponent], uuid)
    if (!node || (node.type !== 'component' && node.type !== 'actor')) return null
    return {
        nodeId: node.id,
        name: node.name,
        uuid,
        kind: node.type,
    }
}

function emitParticipantClass(participant: Participant, lines: string[]): void {
    if (participant.kind === 'actor') {
        lines.push(`    class ${participant.nodeId}["${participant.name}"]:::actor {`)
        lines.push(`        <<actor>>`)
        lines.push(`    }`)
        return
    }

    lines.push(`    class ${participant.nodeId}["${participant.name}"]`)
}

function resolveRootVisibleParticipantUuid(
    rootComponent: ComponentNode,
    childUuids: Set<string>,
    rootActorUuids: Set<string>,
    participantUuid: string
): string | undefined {
    if (childUuids.has(participantUuid) || rootActorUuids.has(participantUuid)) {
        return participantUuid
    }

    let currentUuid = participantUuid
    let parent = findParentNode(rootComponent, currentUuid)
    while (parent) {
        if (parent.uuid === rootComponent.uuid) return currentUuid
        currentUuid = parent.uuid
        parent = findParentNode(rootComponent, currentUuid)
    }

    return undefined
}

function emitInterfaceClass(
    iface: InterfaceSpecification,
    ownerComponent: ComponentNode,
    rootComponent: ComponentNode,
    lines: string[],
    calledFunctionIds?: Set<string>
): void {
    lines.push(`    class ${iface.id}["${iface.name}"] {`)
    lines.push(`        <<interface>>`)
    const effectiveFunctions = resolveEffectiveInterfaceFunctions(
        iface,
        ownerComponent,
        rootComponent
    )
    const fns = calledFunctionIds
        ? effectiveFunctions.filter((fn) => calledFunctionIds.has(fn.id))
        : effectiveFunctions
    for (const fn of fns) {
        const params = fn.parameters
            .map((p) => `${p.name}: ${p.type}${p.required ? '' : '?'}`)
            .join(', ')
        lines.push(`        +${fn.id}(${params})`)
    }
    lines.push(`    }`)
}

/**
 * Builds a Mermaid class diagram for the root component showing all direct
 * sub-components, their interfaces (filtered to functions referenced in
 * sequence diagram messages), and inter-component dependencies.
 */
// eslint-disable-next-line complexity
export function buildRootClassDiagram(rootComponent: ComponentNode): ClassDiagramBuildResult {
    const children = rootComponent.subComponents ?? []
    if (children.length === 0) return { mermaidContent: '', idToUuid: {}, relationshipMetadata: [] }

    const childUuids = new Set(children.map((c) => c.uuid))
    const rootActorUuids = new Set((rootComponent.actors ?? []).map((actor) => actor.uuid))
    const participantMap = new Map<string, Participant>()
    const participatingRootActorUuids = new Set<string>()

    // calledFunctionsByInterface: interfaceId → Set<functionId>
    // records functions called on any child's interface (from any diagram)
    const calledFunctionsByInterface = new Map<string, Set<string>>()

    // inter-child dependencies: senderUuid → interfaceId → Set<functionId>
    const dependencies = new Map<string, Map<string, Set<string>>>()
    const dependencySources = new Map<
        string,
        Map<string, Map<string, { uuid: string; name: string }>>
    >()

    const reachableSequenceDiagrams = collectReferencedSequenceDiagrams(
        rootComponent,
        collectAllDiagrams(rootComponent)
            .filter(({ diagram }) => diagram.type === 'sequence-diagram')
            .map(({ diagram }) => diagram as SequenceDiagramNode)
    )

    for (const seqDiagram of reachableSequenceDiagrams) {
        if (!seqDiagram.content?.trim()) continue

        const ownerNode = findNode([rootComponent], seqDiagram.ownerComponentUuid)
        const ownerComp = ownerNode?.type === 'component' ? ownerNode : null

        const ast: SeqAst = getCachedSeqAst(seqDiagram.content)

        // Build alias→uuid for this diagram
        const aliasToUuid = new Map<string, string>()
        for (const decl of ast.declarations) {
            const uuid =
                decl.path.length === 1
                    ? ownerComp
                        ? findOwnerActorOrComponentUuidById(ownerComp, decl.path[0])
                        : undefined
                    : (findNodeByPath(rootComponent, decl.path.join('/')) ?? undefined)
            if (uuid) aliasToUuid.set(decl.id, uuid)
        }

        for (const msg of flattenMessages(ast.statements)) {
            if (msg.content.kind !== 'functionRef') continue
            const { interfaceId, functionId } = msg.content

            const senderUuid = aliasToUuid.get(msg.from)
            const receiverUuid = aliasToUuid.get(msg.to)
            const visibleSenderUuid = senderUuid
                ? resolveRootVisibleParticipantUuid(
                      rootComponent,
                      childUuids,
                      rootActorUuids,
                      senderUuid
                  )
                : undefined
            const visibleReceiverUuid = receiverUuid
                ? resolveRootVisibleParticipantUuid(
                      rootComponent,
                      childUuids,
                      rootActorUuids,
                      receiverUuid
                  )
                : undefined

            if (visibleSenderUuid && rootActorUuids.has(visibleSenderUuid))
                participatingRootActorUuids.add(visibleSenderUuid)
            if (visibleReceiverUuid && rootActorUuids.has(visibleReceiverUuid))
                participatingRootActorUuids.add(visibleReceiverUuid)

            // Track called functions on any child's interface
            if (visibleReceiverUuid && childUuids.has(visibleReceiverUuid)) {
                if (!calledFunctionsByInterface.has(interfaceId)) {
                    calledFunctionsByInterface.set(interfaceId, new Set())
                }
                calledFunctionsByInterface.get(interfaceId)!.add(functionId)
            }

            // Track visible root-level dependency (rolled up to direct children / root actors)
            if (
                visibleSenderUuid &&
                visibleReceiverUuid &&
                visibleSenderUuid !== visibleReceiverUuid &&
                childUuids.has(visibleReceiverUuid)
            ) {
                if (!dependencies.has(visibleSenderUuid))
                    dependencies.set(visibleSenderUuid, new Map())
                const ifaceMap = dependencies.get(visibleSenderUuid)!
                if (!ifaceMap.has(interfaceId)) ifaceMap.set(interfaceId, new Set())
                ifaceMap.get(interfaceId)!.add(functionId)

                if (!dependencySources.has(visibleSenderUuid))
                    dependencySources.set(visibleSenderUuid, new Map())
                const sourceIfaceMap = dependencySources.get(visibleSenderUuid)!
                if (!sourceIfaceMap.has(interfaceId)) {
                    sourceIfaceMap.set(interfaceId, createSequenceDiagramSourceMap())
                }
                addSequenceDiagramSource(sourceIfaceMap.get(interfaceId)!, seqDiagram)
            }
        }
    }

    const lines: string[] = ['---', 'config:', '  layout: elk', '---', 'classDiagram']
    const idToUuid: Record<string, string> = {}
    const relationshipMetadata: ClassDiagramBuildResult['relationshipMetadata'] = []

    const addRelationship = (
        line: string,
        metadata: ReturnType<typeof toRelationshipMetadata> = null
    ): void => {
        lines.push(line)
        relationshipMetadata.push(metadata)
    }

    // ── Emit each direct child component and its interfaces ───────────────────
    for (const child of children) {
        const participant = toParticipant(rootComponent, child.uuid)
        if (!participant) continue
        participantMap.set(child.uuid, participant)
        emitParticipantClass(participant, lines)
        idToUuid[child.id] = child.uuid

        for (const iface of child.interfaces ?? []) {
            emitInterfaceClass(
                iface,
                child,
                rootComponent,
                lines,
                calledFunctionsByInterface.get(iface.id)
            )
            addRelationship(`    ${child.id} ..|> ${iface.id}`)
        }
    }

    for (const actorUuid of participatingRootActorUuids) {
        const participant = toParticipant(rootComponent, actorUuid)
        if (!participant) continue
        participantMap.set(actorUuid, participant)
        emitParticipantClass(participant, lines)
        idToUuid[participant.nodeId] = participant.uuid
    }

    // ── Emit root-level dependency arrows ─────────────────────────────────────
    for (const [senderUuid, ifaceMap] of dependencies) {
        const sender = participantMap.get(senderUuid)
        if (!sender) continue

        for (const [ifaceId] of ifaceMap) {
            addRelationship(
                `    ${sender.nodeId} ..> ${ifaceId}`,
                toRelationshipMetadata(
                    dependencySources.get(senderUuid)?.get(ifaceId) ??
                        createSequenceDiagramSourceMap()
                )
            )
        }
    }

    // ── Click navigation ──────────────────────────────────────────────────────
    for (const nodeId of Object.keys(idToUuid)) {
        lines.push(`    click ${nodeId} call __integraNavigate("${nodeId}")`)
    }

    return { mermaidContent: lines.join('\n'), idToUuid, relationshipMetadata }
}
