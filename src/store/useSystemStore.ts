import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ComponentNode, Node, SequenceDiagramNode } from './types'
import {
    type ExistingFunctionMatch,
    type ParentAddConflictMatch,
} from '../parser/sequenceDiagram/systemUpdater'
import { findNodeByUuid, collectAllDiagrams } from '../nodes/nodeTree'
import { createHistorySlice, type HistorySlice } from './slices/historySlice'
import { createUiSlice, type UiSlice } from './slices/uiSlice'
import { createNodeOpsSlice, type NodeOpsSlice } from './slices/nodeOpsSlice'
import { createDiagramSlice, type DiagramSlice } from './slices/diagramSlice'
import { safeParsePersistedSystemState } from './modelSchema'
import { normalizeComponentDeep } from '../nodes/interfaceOps'
import { getModelRouteComponentId } from '../utils/systemFiles'

export type FunctionDecision =
    | (ExistingFunctionMatch & { action: 'update-existing' | 'remove-redundant' })
    | (ParentAddConflictMatch & { action: 'apply-parent-add' })

export interface SystemState extends HistorySlice, UiSlice, NodeOpsSlice, DiagramSlice {
    rootComponent: ComponentNode
}

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

const noopStorage = {
    getItem: (_name: string) => null,
    setItem: (_name: string, _value: unknown) => {},
    removeItem: (_name: string) => {},
}

export const findNode = (nodes: Node[], uuid: string): Node | null => findNodeByUuid(nodes, uuid)

export function getSequenceDiagrams(
    comp: ComponentNode
): Array<{ uuid: string; name: string; referencedFunctionUuids: ReadonlyArray<string> }> {
    return collectAllDiagrams(comp)
        .filter(({ diagram }) => diagram.type === 'sequence-diagram')
        .map(({ diagram }) => ({
            uuid: diagram.uuid,
            name: diagram.name,
            referencedFunctionUuids: (diagram as SequenceDiagramNode).referencedFunctionUuids,
        }))
}

export const useSystemStore = create<SystemState>()(
    persist(
        (...args) => ({
            rootComponent: initialSystem,
            ...createHistorySlice(...args),
            ...createUiSlice(...args),
            ...createNodeOpsSlice(...args),
            ...createDiagramSlice(...args),
        }),
        {
            name: 'integra-system',
            ...(getModelRouteComponentId() !== null ? { storage: noopStorage } : {}),
            partialize: (state) => ({
                rootComponent: state.rootComponent,
                savedSnapshot: state.savedSnapshot,
                uiMode: state.uiMode,
            }),
            version: 3,
            migrate: (persistedState) => persistedState,
            merge: (persistedState, currentState) => {
                const parsed = safeParsePersistedSystemState(persistedState)
                if (!parsed.success) {
                    console.error('Ignoring invalid persisted system state', parsed.error)
                    return currentState
                }
                return {
                    ...currentState,
                    rootComponent: normalizeComponentDeep(parsed.data.rootComponent),
                    savedSnapshot: parsed.data.savedSnapshot ?? null,
                    uiMode: parsed.data.uiMode ?? currentState.uiMode,
                }
            },
        }
    )
)
