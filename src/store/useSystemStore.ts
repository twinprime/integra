import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ComponentNode, Node, SequenceDiagramNode } from "./types"
import { parseUseCaseDiagram } from "../utils/useCaseDiagramParser"
import { parseSequenceDiagram, type FunctionMatch } from "../utils/sequenceDiagramParser"
import { applyIdRename } from "../utils/renameNodeId"
import {
  findNodeByUuid,
  deleteNodeFromTree,
  collectAllDiagrams,
  findOwnerComponentUuid,
  findIdByUuid,
  upsertNodeInTree,
  addChildToNode,
} from "../nodes/nodeTree"
import {
  updateFunctionParams,
  addFunctionToInterface,
  removeFunctionsFromInterfaces,
} from "../nodes/componentNode"
import { replaceSignatureInContent } from "../nodes/sequenceDiagramNode"

export type FunctionDecision = FunctionMatch & {
  action: "add-new" | "update-existing" | "update-all"
}

interface SystemState {
  rootComponent: ComponentNode
  selectedNodeId: string | null
  parseError: string | null
  savedSnapshot: string | null
  past: ComponentNode[]
  future: ComponentNode[]
  setSystem: (rootComponent: ComponentNode) => void
  selectNode: (nodeId: string | null) => void
  updateNode: (nodeId: string, updates: Record<string, unknown>) => void
  addNode: (parentId: string, node: Node) => void
  deleteNode: (nodeId: string) => void
  clearParseError: () => void
  markSaved: (snapshot: string) => void
  clearSystem: () => void
  undo: () => void
  redo: () => void
  applyFunctionUpdates: (
    decisions: FunctionDecision[],
    currentDiagramUuid: string,
    currentDiagramContent: string,
  ) => void
  renameNodeId: (uuid: string, newId: string) => void
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

// Helper to recursively find a node by uuid
export const findNode = (nodes: Node[], uuid: string): Node | null =>
  findNodeByUuid(nodes, uuid)

export function getSequenceDiagrams(
  comp: ComponentNode,
): Array<{ uuid: string; name: string; referencedFunctionUuids: string[] }> {
  return collectAllDiagrams(comp)
    .filter(({ diagram }) => diagram.type === "sequence-diagram")
    .map(({ diagram }) => ({
      uuid: diagram.uuid,
      name: diagram.name,
      referencedFunctionUuids: (diagram as SequenceDiagramNode)
        .referencedFunctionUuids,
    }))
}

function rebuildSystemDiagrams(system: ComponentNode): ComponentNode {
  let updatedSystem = system
  const allDiagrams = collectAllDiagrams(updatedSystem)

  allDiagrams.forEach(({ diagram, ownerComponentUuid }) => {
    if (!diagram.ownerComponentUuid) {
      updatedSystem = upsertNodeInTree(updatedSystem, diagram.uuid, (node) => ({
        ...node,
        ownerComponentUuid,
      }))
    }
  })

  allDiagrams.forEach(({ diagram, ownerComponentUuid }) => {
    if (diagram.content) {
      if (diagram.type === "use-case-diagram") {
        updatedSystem = parseUseCaseDiagram(
          diagram.content,
          updatedSystem,
          ownerComponentUuid,
          diagram.uuid,
        )
      } else if (diagram.type === "sequence-diagram") {
        try {
          updatedSystem = parseSequenceDiagram(
            diagram.content,
            updatedSystem,
            ownerComponentUuid,
            diagram.uuid,
          )
        } catch {
          // skip invalid diagrams on load
        }
      }
    }
  })

  return updatedSystem
}

function stripExclusiveFunctionContributions(system: ComponentNode, diagramUuid: string): ComponentNode {
  const allDiagrams = collectAllDiagrams(system)

  const otherRefs = new Set<string>()
  for (const { diagram } of allDiagrams) {
    if (diagram.uuid !== diagramUuid && diagram.type === "sequence-diagram") {
      for (const uuid of (diagram as SequenceDiagramNode).referencedFunctionUuids) {
        otherRefs.add(uuid)
      }
    }
  }

  const thisDiagram = allDiagrams.find(({ diagram }) => diagram.uuid === diagramUuid)
  if (!thisDiagram || thisDiagram.diagram.type !== "sequence-diagram") return system

  const toRemove = new Set(
    (thisDiagram.diagram as SequenceDiagramNode).referencedFunctionUuids.filter(
      (uuid) => !otherRefs.has(uuid),
    ),
  )
  return removeFunctionsFromInterfaces(system, toRemove)
}

function tryReparseContent(
  content: string,
  system: ComponentNode,
  nodeUuid: string,
): Partial<SystemState> {
  const node = findNode([system], nodeUuid)
  if (!node || (node.type !== "use-case-diagram" && node.type !== "sequence-diagram")) {
    return { rootComponent: system }
  }
  if (!node.ownerComponentUuid) return { rootComponent: system }
  try {
    if (node.type === "use-case-diagram") {
      return {
        rootComponent: parseUseCaseDiagram(content, system, node.ownerComponentUuid, nodeUuid),
        parseError: null,
      }
    }
    const cleanedSystem = stripExclusiveFunctionContributions(system, nodeUuid)
    return {
      rootComponent: parseSequenceDiagram(content, cleanedSystem, node.ownerComponentUuid, nodeUuid),
      parseError: null,
    }
  } catch (err) {
    return { parseError: err instanceof Error ? err.message : String(err) }
  }
}

const HISTORY_LIMIT = 50

function pushPast(past: ComponentNode[], current: ComponentNode): ComponentNode[] {
  return [...past.slice(-(HISTORY_LIMIT - 1)), current]
}

export const useSystemStore = create<SystemState>()(
  persist(
    (set) => ({
  rootComponent: initialSystem,
  selectedNodeId: null,
  parseError: null,
  savedSnapshot: null,
  past: [],
  future: [],
  clearParseError: () => set({ parseError: null }),
  markSaved: (snapshot) => set({ savedSnapshot: snapshot }),
  clearSystem: () =>
    set((state) => ({
      past: pushPast(state.past, state.rootComponent),
      future: [],
      rootComponent: initialSystem,
      selectedNodeId: null,
      savedSnapshot: null,
    })),
  setSystem: (rootComponent) =>
    set((state) => ({
      past: pushPast(state.past, state.rootComponent),
      future: [],
      rootComponent: rebuildSystemDiagrams(rootComponent),
    })),
  undo: () =>
    set((state) => {
      if (!state.past.length) return {}
      const prev = state.past[state.past.length - 1]
      return {
        rootComponent: prev,
        past: state.past.slice(0, -1),
        future: [state.rootComponent, ...state.future],
      }
    }),
  redo: () =>
    set((state) => {
      if (!state.future.length) return {}
      const next = state.future[0]
      return {
        rootComponent: next,
        past: pushPast(state.past, state.rootComponent),
        future: state.future.slice(1),
      }
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  addNode: (parentUuid, node) =>
    set((state) => {
      const ownerUuid = findOwnerComponentUuid(state.rootComponent, parentUuid) ?? state.rootComponent.uuid
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
      const updatedSystem = upsertNodeInTree(state.rootComponent, nodeUuid, (node) => ({ ...node, ...updates } as Node))
      const historyPush = { past: pushPast(state.past, state.rootComponent), future: [] }
      if (!updates.content) return { ...historyPush, rootComponent: updatedSystem }
      return { ...historyPush, ...tryReparseContent(updates.content as string, updatedSystem, nodeUuid) }
    }),
  deleteNode: (nodeUuid) =>
    set((state) => {
      const newSelectedId =
        state.selectedNodeId === nodeUuid ? null : state.selectedNodeId
      return {
        past: pushPast(state.past, state.rootComponent),
        future: [],
        rootComponent: deleteNodeFromTree(
          state.rootComponent,
          nodeUuid,
        ) as ComponentNode,
        selectedNodeId: newSelectedId,
      }
    }),
  applyFunctionUpdates: (decisions, currentDiagramUuid, currentDiagramContent) =>
    set((state) => {
      let system = state.rootComponent

      for (const d of decisions) {
        if (d.action === "add-new") {
          system = addFunctionToInterface(
            system,
            d.functionUuid,
            d.functionId,
            d.newParams,
          )
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
  }),
  {
    name: "integra-system",
    partialize: (state) => ({ rootComponent: state.rootComponent }),
  }
))
