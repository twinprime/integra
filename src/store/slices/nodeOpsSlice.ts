import type { Node, ComponentNode } from '../types'
import type { StateCreator } from 'zustand'
import type { SystemState } from '../useSystemStore'
import { pushPast } from './historySlice'
import {
    findOwnerComponentUuid,
    upsertNodeInTree,
    addChildToNode,
    deleteNodeFromTree,
    findIdByUuid,
    reorderChildInParent,
} from '../../nodes/nodeTree'
import { tryReparseContent, rebuildSystemDiagrams } from '../systemOps'
import { applyIdRename } from '../../utils/renameNodeId'
import { normalizeComponent } from '../../nodes/interfaceOps'

export type NodeOpsSlice = {
    addNode: (parentId: string, node: Node) => void
    updateNode: (nodeId: string, updates: Record<string, unknown>) => void
    deleteNode: (nodeId: string) => void
    renameNodeId: (uuid: string, newId: string) => void
    reorderNode: (parentUuid: string, activeUuid: string, overUuid: string) => void
}

export const createNodeOpsSlice: StateCreator<SystemState, [], [], NodeOpsSlice> = (set) => ({
    addNode: (parentUuid, node) =>
        set((state) => {
            const ownerUuid =
                findOwnerComponentUuid(state.rootComponent, parentUuid) ?? state.rootComponent.uuid
            return {
                past: pushPast(state.past, state.rootComponent),
                future: [],
                rootComponent: upsertNodeInTree(state.rootComponent, parentUuid, (parent) =>
                    addChildToNode(parent, node, ownerUuid)
                ),
            }
        }),
    updateNode: (nodeUuid, updates) =>
        set((state) => {
            const updatedSystem = upsertNodeInTree(state.rootComponent, nodeUuid, (node) => {
                const merged: Node = { ...node, ...updates }
                return merged.type === 'component' ? normalizeComponent(merged) : merged
            })
            const historyPush = { past: pushPast(state.past, state.rootComponent), future: [] }
            if (!updates.content) return { ...historyPush, rootComponent: updatedSystem }
            return {
                ...historyPush,
                ...tryReparseContent(updates.content as string, updatedSystem, nodeUuid),
            }
        }),
    deleteNode: (nodeUuid) =>
        set((state) => {
            const newSelectedId = state.selectedNodeId === nodeUuid ? null : state.selectedNodeId
            return {
                past: pushPast(state.past, state.rootComponent),
                future: [],
                rootComponent: deleteNodeFromTree(state.rootComponent, nodeUuid) as ComponentNode,
                selectedNodeId: newSelectedId,
            }
        }),
    renameNodeId: (uuid, newId) =>
        set((state) => {
            const oldId = findIdByUuid(state.rootComponent, uuid)
            if (!oldId || oldId === newId) return state
            const renamed = applyIdRename(state.rootComponent, uuid, oldId, newId)
            const rebuilt = rebuildSystemDiagrams(renamed)
            return {
                past: pushPast(state.past, state.rootComponent),
                future: [],
                rootComponent: rebuilt,
            }
        }),
    reorderNode: (parentUuid, activeUuid, overUuid) =>
        set((state) => ({
            past: pushPast(state.past, state.rootComponent),
            future: [],
            rootComponent: reorderChildInParent(
                state.rootComponent,
                parentUuid,
                activeUuid,
                overUuid
            ),
        })),
})
