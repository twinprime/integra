import type { ComponentNode, SequenceDiagramNode } from "../types"
import type { StateCreator } from "zustand"
import type { SystemState } from "../useSystemStore"
import type { FunctionDecision } from "../useSystemStore"
import { pushPast } from "./historySlice"
import { upsertNodeInTree } from "../../nodes/nodeTree"
import { addFunctionToInterface, updateFunctionParams } from "../../nodes/componentNode"
import { replaceSignatureInContent } from "../../nodes/sequenceDiagramNode"
import { rebuildSystemDiagrams, tryReparseContent } from "../systemOps"

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

export type DiagramSlice = {
  setSystem: (rootComponent: ComponentNode) => void
  clearSystem: () => void
  applyFunctionUpdates: (
    decisions: FunctionDecision[],
    currentDiagramUuid: string,
    currentDiagramContent: string,
  ) => void
}

export const createDiagramSlice: StateCreator<SystemState, [], [], DiagramSlice> = (set) => ({
  setSystem: (rootComponent) =>
    set((state) => ({
      past: pushPast(state.past, state.rootComponent),
      future: [],
      rootComponent: rebuildSystemDiagrams(rootComponent),
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

      for (const d of decisions) {
        if (d.action === "add-new") {
          system = addFunctionToInterface(system, d.functionUuid, d.functionId, d.newParams)
        } else {
          system = updateFunctionParams(system, d.functionUuid, d.newParams)
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
                  d.newParams,
                ),
              }
            })
          }
        }
      }

      const updatedWithContent = upsertNodeInTree(
        system,
        currentDiagramUuid,
        (node) => ({ ...node, content: currentDiagramContent }),
      )
      return {
        past: pushPast(state.past, state.rootComponent),
        future: [],
        ...tryReparseContent(currentDiagramContent, updatedWithContent, currentDiagramUuid),
      }
    }),
})
