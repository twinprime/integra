/**
 * systemUpdater.ts — replaces src/utils/sequenceDiagramParser.ts
 *
 * Parses sequence diagram DSL content using the Chevrotain-based parser and
 * updates the component tree accordingly.
 */
import type { ComponentNode } from '../../store/types'
import { upsertNodeInTree, mergeLists } from '../../nodes/nodeTree'
import { findCompByUuid } from '../../nodes/nodeTree'
import { findNodeByPath } from '../../utils/nodeUtils'
import {
    resolveUseCaseReferenceUuid,
    resolveSequenceReferenceUuid,
    ensureScopedNodePath,
    resolveFunctionReferenceTarget,
    assertMessageReferencePathInScope,
    isComponentReferenceTargetInScope,
} from '../../utils/diagramResolvers'
import { parseSequenceDiagramCst } from './parser'
import { buildSeqAst, flattenMessages } from './visitor'
import { deriveNameFromId } from '../../utils/nameUtils'
import { findInheritedParentFunction, isInheritedInterface } from '../../utils/interfaceFunctions'
import {
    type FunctionMatch,
    findParentInterfaceChildConflicts,
    parseParameters,
    paramsToString,
    paramsMatch,
    applyFunctionToComponentByUuid,
    resolveExternalOwnerUuid,
    applyMessageToComponents,
} from './systemUpdaterHelpers'

export type { FunctionMatch }
export { parseParameters, paramsToString }

export function analyzeSequenceDiagramChanges(
    content: string,
    rootComponent: ComponentNode,
    diagramUuid: string,
    allSeqDiagrams: ReadonlyArray<{ uuid: string; referencedFunctionUuids: ReadonlyArray<string> }>
): FunctionMatch[] {
    if (!content.trim()) return []
    const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
    if (lexErrors.length || parseErrors.length) return []

    const ast = buildSeqAst(cst)

    const otherRefs = new Set(
        allSeqDiagrams
            .filter((d) => d.uuid !== diagramUuid)
            .flatMap((d) => d.referencedFunctionUuids)
    )

    const matches: FunctionMatch[] = []
    const seen = new Set<string>()

    for (const stmt of flattenMessages(ast.statements)) {
        if (stmt.content.kind !== 'functionRef') continue
        const { interfaceId, functionId, rawParams } = stmt.content
        const key = `${stmt.to}:${interfaceId}:${functionId}`
        if (seen.has(key)) continue
        seen.add(key)

        const newParams = parseParameters(rawParams)
        const existing = resolveFunctionReferenceTarget(
            rootComponent,
            stmt.to,
            interfaceId,
            functionId
        )
        if (!existing || paramsMatch(existing.parameters, newParams)) continue

        const ownerComponent = findCompByUuid(rootComponent, existing.componentUuid)
        const existingInterface =
            ownerComponent?.interfaces.find((iface) => iface.uuid === existing.interfaceUuid) ??
            null
        if (!ownerComponent || !existingInterface) continue

        if (isInheritedInterface(existingInterface)) {
            const isChildLocalFunction = existingInterface.functions.some(
                (candidate) => candidate.uuid === existing.functionUuid
            )
            if (!isChildLocalFunction) {
                continue
            }

            const inheritedParentFn = findInheritedParentFunction(
                existingInterface,
                ownerComponent,
                rootComponent,
                functionId,
                newParams
            )

            if (inheritedParentFn) {
                const affectedDiagramUuids = allSeqDiagrams
                    .filter(
                        (d) =>
                            d.uuid !== diagramUuid &&
                            d.referencedFunctionUuids.includes(existing.functionUuid)
                    )
                    .map((d) => d.uuid)

                matches.push({
                    kind: 'redundant',
                    interfaceId,
                    functionId,
                    functionUuid: existing.functionUuid,
                    oldParams: existing.parameters,
                    newParams,
                    affectedDiagramUuids,
                    conflictingChildFunctions: [],
                })
                continue
            }
        }

        const kind = existing.parameters.length === newParams.length ? 'incompatible' : 'compatible'
        const affectedDiagramUuids = allSeqDiagrams
            .filter(
                (d) =>
                    d.uuid !== diagramUuid &&
                    d.referencedFunctionUuids.includes(existing.functionUuid)
            )
            .map((d) => d.uuid)
        const conflictingChildFunctions = findParentInterfaceChildConflicts(
            rootComponent,
            existing.interfaceUuid,
            functionId,
            newParams
        )

        if (
            kind === 'incompatible' &&
            !otherRefs.has(existing.functionUuid) &&
            conflictingChildFunctions.length === 0
        ) {
            continue
        }

        matches.push({
            kind,
            interfaceId,
            functionId,
            functionUuid: existing.functionUuid,
            oldParams: existing.parameters,
            newParams,
            affectedDiagramUuids,
            conflictingChildFunctions,
        })
    }

    return matches
}

// eslint-disable-next-line complexity
export function parseSequenceDiagram(
    content: string,
    rootComponent: ComponentNode,
    ownerComponentUuid: string,
    diagramUuid: string
): ComponentNode {
    if (!content.trim()) return rootComponent
    const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
    if (lexErrors.length || parseErrors.length) {
        const lexMessages = lexErrors.map((e) => {
            const loc = e.line != null ? `Line ${e.line}, Col ${e.column ?? 1}: ` : ''
            return `${loc}${e.message}`
        })
        const parseMessages = parseErrors.map((e) => {
            const line = e.token?.startLine
            const col = e.token?.startColumn
            const loc = line != null ? `Line ${line}, Col ${col ?? 1}: ` : ''
            return `${loc}${e.message}`
        })
        throw new Error([...lexMessages, ...parseMessages].join('\n'))
    }

    const ast = buildSeqAst(cst)

    // Mutable root — may be updated as missing path nodes are auto-created
    let root = rootComponent

    // Maps participantId (alias or path.last) → treeNodeId (path[0] for local)
    const participantToTreeId = new Map<string, string>()
    // Maps participantId → UUID for external (multi-segment path) participants
    const participantExternalUuidMap = new Map<string, string>()
    const externalUuids: string[] = []
    const localActors: ComponentNode['actors'][number][] = []
    const localComponents: ComponentNode[] = []

    for (const decl of ast.declarations) {
        const treeNodeId = decl.path[decl.path.length - 1]
        participantToTreeId.set(decl.id, decl.path[0])

        if (decl.path.length === 1) {
            // Local node
            if (decl.entityType === 'actor') {
                localActors.push({
                    uuid: crypto.randomUUID(),
                    id: treeNodeId,
                    name: decl.alias ?? deriveNameFromId(treeNodeId),
                    type: 'actor',
                    description: '',
                })
            } else {
                localComponents.push({
                    uuid: crypto.randomUUID(),
                    id: treeNodeId,
                    name: decl.alias ?? deriveNameFromId(treeNodeId),
                    type: 'component',
                    description: '',
                    subComponents: [],
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [],
                })
            }
        } else {
            // External node: resolve UUID from root tree (try relative to ownerComp first)
            const pathStr = decl.path.join('/')
            let uuid = findNodeByPath(root, pathStr, ownerComponentUuid)
            if (!uuid) {
                const created = ensureScopedNodePath(
                    root,
                    decl.path,
                    decl.entityType as 'actor' | 'component',
                    ownerComponentUuid
                )
                if (!created) throw new Error(`Cannot resolve path: "${pathStr}"`)
                root = created.updatedRoot
                uuid = created.uuid
            }
            // Scope check: verify the owning component is in scope for this diagram
            const owningCompUuid =
                decl.entityType === 'component'
                    ? uuid
                    : findNodeByPath(root, decl.path.slice(0, -1).join('/'), ownerComponentUuid)
            if (
                !owningCompUuid ||
                !isComponentReferenceTargetInScope(root, ownerComponentUuid, owningCompUuid)
            ) {
                throw new Error(`Reference "${pathStr}" is out of scope for this diagram`)
            }
            if (!externalUuids.includes(uuid)) externalUuids.push(uuid)
            participantExternalUuidMap.set(decl.id, uuid)
        }
    }

    // Handle self-reference (owner component declared as a participant)
    const ownerCompBefore = findCompByUuid(root, ownerComponentUuid)
    const filteredComponents = localComponents.filter((c) => {
        if (ownerCompBefore && c.id === ownerCompBefore.id) {
            // Self-reference: replace with external UUID
            if (!externalUuids.includes(ownerComponentUuid)) externalUuids.push(ownerComponentUuid)
            // Update participantToTreeId to point to ownerComp
            const pid = [...participantToTreeId.entries()].find(([, v]) => v === c.id)?.[0]
            if (pid) participantToTreeId.set(pid, ownerCompBefore.id)
            return false
        }
        return true
    })

    // Upsert local participants into owner component
    let updatedRoot = upsertNodeInTree(root, ownerComponentUuid, (node) => {
        const comp = node as ComponentNode
        return {
            ...comp,
            actors: mergeLists(comp.actors ?? [], localActors),
            subComponents: mergeLists(comp.subComponents, filteredComponents),
        }
    })

    // Resolve referencedNodeIds from updated tree
    const updatedOwnerComp = findCompByUuid(updatedRoot, ownerComponentUuid)
    const referencedNodeIds = [...externalUuids]

    if (updatedOwnerComp) {
        for (const treeNodeId of new Set(participantToTreeId.values())) {
            const actor = updatedOwnerComp.actors?.find((a) => a.id === treeNodeId)
            if (actor) {
                if (!referencedNodeIds.includes(actor.uuid)) referencedNodeIds.push(actor.uuid)
                continue
            }
            const comp = updatedOwnerComp.subComponents?.find((c) => c.id === treeNodeId)
            if (comp && !referencedNodeIds.includes(comp.uuid)) referencedNodeIds.push(comp.uuid)
        }
        // Also include owner if self-referenced
        if (
            externalUuids.includes(ownerComponentUuid) &&
            !referencedNodeIds.includes(ownerComponentUuid)
        ) {
            referencedNodeIds.push(ownerComponentUuid)
        }
    }

    // Apply messages: build a working components list [owner, ...subComponents]
    // keyed by treeNodeId for local participants; external participants are handled via UUID.
    const astMessages = flattenMessages(ast.statements)
    if (astMessages.length > 0 && updatedOwnerComp) {
        let workingComponents: ReadonlyArray<ComponentNode> = [
            updatedOwnerComp,
            ...updatedOwnerComp.subComponents,
        ]

        // Collect external-participant function assignments to apply after local writeback.
        // They must run after to avoid being overwritten by the workingComponents writeback.
        const pendingExternalFunctions: Array<{
            ownerUuid: string
            interfaceId: string
            functionId: string
            rawParams: string
        }> = []

        for (const msg of astMessages) {
            if (msg.content.kind !== 'functionRef') continue
            const { interfaceId, functionId, rawParams } = msg.content
            const fromExtUuid = participantExternalUuidMap.get(msg.from)
            const toExtUuid = participantExternalUuidMap.get(msg.to)

            if (fromExtUuid !== undefined || toExtUuid !== undefined) {
                // At least one participant is external — defer to post-writeback processing
                const ownerUuid = resolveExternalOwnerUuid(
                    updatedRoot,
                    fromExtUuid,
                    toExtUuid,
                    interfaceId
                )
                if (ownerUuid) {
                    pendingExternalFunctions.push({ ownerUuid, interfaceId, functionId, rawParams })
                } else {
                    // Owner is local (e.g. kafka sender is local while receiver is external)
                    const fromTreeId = participantToTreeId.get(msg.from) ?? msg.from
                    const toTreeId = participantToTreeId.get(msg.to) ?? msg.to
                    workingComponents = applyMessageToComponents(
                        workingComponents,
                        fromTreeId,
                        toTreeId,
                        interfaceId,
                        functionId,
                        rawParams,
                        updatedRoot
                    )
                }
            } else {
                // Both participants are local
                const fromTreeId = participantToTreeId.get(msg.from) ?? msg.from
                const toTreeId = participantToTreeId.get(msg.to) ?? msg.to
                workingComponents = applyMessageToComponents(
                    workingComponents,
                    fromTreeId,
                    toTreeId,
                    interfaceId,
                    functionId,
                    rawParams,
                    updatedRoot
                )
            }
        }

        // Write back local component changes
        const [updatedOwner, ...updatedSubComponents] = workingComponents
        updatedRoot = upsertNodeInTree(updatedRoot, ownerComponentUuid, () => ({
            ...updatedOwner,
            subComponents: updatedSubComponents,
        }))

        // Apply external participant function assignments after writeback
        for (const { ownerUuid, interfaceId, functionId, rawParams } of pendingExternalFunctions) {
            updatedRoot = applyFunctionToComponentByUuid(
                updatedRoot,
                ownerUuid,
                interfaceId,
                functionId,
                rawParams
            )
        }
    }

    // Track referencedFunctionUuids
    const referencedFunctionUuids: string[] = []
    for (const msg of astMessages) {
        if (msg.content.kind !== 'functionRef') continue
        const fnUuid =
            resolveFunctionReferenceTarget(
                updatedRoot,
                msg.to,
                msg.content.interfaceId,
                msg.content.functionId
            )?.functionUuid ?? null
        if (fnUuid && !referencedFunctionUuids.includes(fnUuid))
            referencedFunctionUuids.push(fnUuid)
    }

    // Add referenced use case and sequence diagram UUIDs to referencedNodeIds
    if (updatedOwnerComp) {
        for (const msg of astMessages) {
            if (msg.content.kind === 'useCaseRef') {
                assertMessageReferencePathInScope(msg.content.path, updatedRoot, ownerComponentUuid)
                const ucUuid = resolveUseCaseReferenceUuid(
                    msg.content.path,
                    updatedRoot,
                    updatedOwnerComp,
                    ownerComponentUuid
                )
                if (ucUuid && !referencedNodeIds.includes(ucUuid)) referencedNodeIds.push(ucUuid)
            } else if (msg.content.kind === 'seqDiagramRef') {
                assertMessageReferencePathInScope(msg.content.path, updatedRoot, ownerComponentUuid)
                const seqUuid = resolveSequenceReferenceUuid(
                    msg.content.path,
                    updatedRoot,
                    updatedOwnerComp,
                    ownerComponentUuid
                )
                if (seqUuid && !referencedNodeIds.includes(seqUuid)) referencedNodeIds.push(seqUuid)
            }
        }
    }

    // Update diagram node
    updatedRoot = upsertNodeInTree(updatedRoot, diagramUuid, (node) => ({
        ...node,
        referencedNodeIds,
        referencedFunctionUuids,
    }))

    return updatedRoot
}
