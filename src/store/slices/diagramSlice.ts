import type { ComponentNode, SequenceDiagramNode } from '../types'
import type { StateCreator } from 'zustand'
import type { SystemState } from '../useSystemStore'
import type { FunctionDecision } from '../useSystemStore'
import { pushPast } from './historySlice'
import { upsertNodeInTree } from '../../nodes/nodeTree'
import { removeFunctionsFromInterfaces, updateFunctionParams } from '../../nodes/componentNode'
import { replaceSignatureInContent } from '../../nodes/sequenceDiagramNode'
import {
    rebuildSystemDiagrams,
    rebuildWithMetadataPreservation,
    tryReparseContent,
} from '../systemOps'
import { normalizeComponentDeep } from '../../nodes/interfaceOps'

const initialSystem: ComponentNode = {
    uuid: 'root-component-uuid',
    id: 'root',
    name: 'My System',
    type: 'component',
    description: 'Root System Component',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

export type DiagramSlice = {
    setSystem: (rootComponent: ComponentNode) => void
    clearSystem: () => void
    applyFunctionUpdates: (
        decisions: FunctionDecision[],
        currentDiagramUuid: string,
        currentDiagramContent: string
    ) => void
}

export const createDiagramSlice: StateCreator<SystemState, [], [], DiagramSlice> = (set) => ({
    setSystem: (rootComponent) =>
        set((state) => ({
            past: pushPast(state.past, state.rootComponent),
            future: [],
            rootComponent: normalizeComponentDeep(rebuildSystemDiagrams(rootComponent)),
        })),
    clearSystem: () =>
        set((state) => ({
            past: pushPast(state.past, state.rootComponent),
            future: [],
            rootComponent: initialSystem,
            selectedNodeId: null,
            savedSnapshot: null,
        })),
    applyFunctionUpdates: (decisions, currentDiagramUuid, currentDiagramContent) =>
        set((state) => {
            let system = state.rootComponent
            let updatedCurrentContent = currentDiagramContent
            const functionUuidsToRemove = new Set<string>()

            let hasParentAddConflict = false

            for (const d of decisions) {
                if (d.action === 'apply-parent-add') {
                    hasParentAddConflict = true
                    // Collect conflicting child function UUIDs for removal
                    for (const conflict of d.conflictingChildFunctions) {
                        functionUuidsToRemove.add(conflict.functionUuid)
                    }
                    // Rewrite each affected diagram's content to use new parent signature
                    for (const diagUuid of d.affectedDiagramUuids) {
                        system = upsertNodeInTree(system, diagUuid, (node) => {
                            const diagramNode = node as SequenceDiagramNode
                            if (!diagramNode.content) return diagramNode
                            return {
                                ...diagramNode,
                                content: replaceSignatureInContent(
                                    diagramNode.content,
                                    d.interfaceId,
                                    d.functionId,
                                    d.newParams
                                ),
                            }
                        })
                    }
                    updatedCurrentContent = replaceSignatureInContent(
                        updatedCurrentContent,
                        d.interfaceId,
                        d.functionId,
                        d.newParams
                    )
                    continue
                }

                if (d.action === 'remove-redundant') {
                    functionUuidsToRemove.add(d.functionUuid)
                    for (const diagUuid of d.affectedDiagramUuids) {
                        system = upsertNodeInTree(system, diagUuid, (node) => {
                            const diagramNode = node as SequenceDiagramNode
                            if (!diagramNode.content) return diagramNode
                            return {
                                ...diagramNode,
                                content: replaceSignatureInContent(
                                    diagramNode.content,
                                    d.interfaceId,
                                    d.functionId,
                                    d.newParams
                                ),
                            }
                        })
                    }
                    updatedCurrentContent = replaceSignatureInContent(
                        updatedCurrentContent,
                        d.interfaceId,
                        d.functionId,
                        d.newParams
                    )
                    continue
                }

                system = updateFunctionParams(system, d.functionUuid, d.newParams)
                ;(d.conflictingChildFunctions ?? []).forEach((conflict) =>
                    functionUuidsToRemove.add(conflict.functionUuid)
                )
                // Update all other diagrams that reference this function
                for (const diagUuid of d.affectedDiagramUuids) {
                    system = upsertNodeInTree(system, diagUuid, (node) => {
                        const diagramNode = node as SequenceDiagramNode
                        if (!diagramNode.content) return diagramNode
                        return {
                            ...diagramNode,
                            content: replaceSignatureInContent(
                                diagramNode.content,
                                d.interfaceId,
                                d.functionId,
                                d.newParams
                            ),
                        }
                    })
                }
                // Also update the current diagram's content so that any other messages
                // referencing the same function (not just the one the user edited) are
                // updated to the new signature.
                updatedCurrentContent = replaceSignatureInContent(
                    updatedCurrentContent,
                    d.interfaceId,
                    d.functionId,
                    d.newParams
                )
            }

            if (functionUuidsToRemove.size > 0) {
                system = removeFunctionsFromInterfaces(system, functionUuidsToRemove)
            }

            const updatedWithContent = upsertNodeInTree(system, currentDiagramUuid, (node) => ({
                ...node,
                content: updatedCurrentContent,
            }))

            if (hasParentAddConflict) {
                // Full rebuild: reparses all diagrams so referencedFunctionUuids in every
                // affected diagram resolves to the newly added parent function UUID.
                return {
                    past: pushPast(state.past, state.rootComponent),
                    future: [],
                    rootComponent: rebuildWithMetadataPreservation(updatedWithContent),
                    parseError: null,
                }
            }

            return {
                past: pushPast(state.past, state.rootComponent),
                future: [],
                ...tryReparseContent(updatedCurrentContent, updatedWithContent, currentDiagramUuid),
            }
        }),
})
