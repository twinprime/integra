import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ComponentNode, Node, SequenceDiagramNode } from "./types"
import { type FunctionMatch } from "../parser/sequenceDiagram/systemUpdater"
import { findNodeByUuid, collectAllDiagrams } from "../nodes/nodeTree"
import { createHistorySlice, type HistorySlice } from "./slices/historySlice"
import { createUiSlice, type UiSlice } from "./slices/uiSlice"
import { createNodeOpsSlice, type NodeOpsSlice } from "./slices/nodeOpsSlice"
import { createDiagramSlice, type DiagramSlice } from "./slices/diagramSlice"
import { safeParsePersistedSystemState } from "./modelSchema"
import { normalizeComponentDeep } from "../nodes/interfaceOps"

export type FunctionDecision = FunctionMatch & {
  action: "add-new" | "update-existing" | "update-all"
}

export interface SystemState extends HistorySlice, UiSlice, NodeOpsSlice, DiagramSlice {
  rootComponent: ComponentNode
}

const initialSystem: ComponentNode = {
  uuid: "root-component-uuid",
  id: "root",
  name: "My System",
  type: "component",
  description: "Root System Component",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
}

export const findNode = (nodes: Node[], uuid: string): Node | null =>
  findNodeByUuid(nodes, uuid)

export function getSequenceDiagrams(
  comp: ComponentNode,
): Array<{ uuid: string; name: string; referencedFunctionUuids: ReadonlyArray<string> }> {
  return collectAllDiagrams(comp)
    .filter(({ diagram }) => diagram.type === "sequence-diagram")
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
      name: "integra-system",
      partialize: (state) => ({ rootComponent: state.rootComponent }),
      version: 2,
      migrate: (persistedState) => persistedState,
      merge: (persistedState, currentState) => {
        const parsed = safeParsePersistedSystemState(persistedState)
        if (!parsed.success) {
          console.error("Ignoring invalid persisted system state", parsed.error)
          return currentState
        }
        return {
          ...currentState,
          rootComponent: normalizeComponentDeep(parsed.data.rootComponent),
        }
      },
    },
  ),
)
