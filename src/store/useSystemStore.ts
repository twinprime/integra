import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ComponentNode, Node, DiagramNode, UseCaseDiagramNode, UseCaseNode, SequenceDiagramNode, Parameter } from "./types"
import { parseUseCaseDiagram } from "../utils/useCaseDiagramParser"
import { parseSequenceDiagram, paramsToString, type FunctionMatch } from "../utils/sequenceDiagramParser"
import { upsertTree } from "../utils/diagramParserHelpers"
import { applyIdRename } from "../utils/renameNodeId"

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

function getNodeChildren(node: Node): Node[] {
  switch (node.type) {
    case "component": return [...node.subComponents, ...node.actors, ...node.useCaseDiagrams]
    case "use-case-diagram": return [...node.useCases]
    case "use-case": return [...node.sequenceDiagrams]
    default: return []
  }
}

// Helper to recursively find a node by uuid
export const findNode = (
  nodes: Node[],
  uuid: string,
): Node | null => {
  for (const node of nodes) {
    if (node.uuid === uuid) return node
    const children = getNodeChildren(node)
    if (children.length > 0) {
      const found = findNode(children, uuid)
      if (found) return found
    }
  }
  return null
}

// Helper to recursively delete a node
const deleteNodeRecursive = (node: Node, uuid: string): Node => {
  if (node.type === "component") {
    return {
      ...node,
      subComponents: node.subComponents
        .filter((c) => c.uuid !== uuid)
        .map((c) => deleteNodeRecursive(c, uuid) as ComponentNode),
      actors: node.actors.filter((a) => a.uuid !== uuid),
      useCaseDiagrams: node.useCaseDiagrams
        .filter((d) => d.uuid !== uuid)
        .map((d) => deleteNodeRecursive(d, uuid) as UseCaseDiagramNode),
    }
  }

  if (node.type === "use-case-diagram") {
    return {
      ...node,
      useCases: node.useCases
        .filter((u) => u.uuid !== uuid)
        .map((u) => deleteNodeRecursive(u, uuid) as UseCaseNode),
    }
  }

  if (node.type === "use-case") {
    return {
      ...node,
      sequenceDiagrams: node.sequenceDiagrams
        .filter((d) => d.uuid !== uuid)
        .map((d) => deleteNodeRecursive(d, uuid) as SequenceDiagramNode),
    }
  }

  return node
}

function collectAllDiagrams(
  comp: ComponentNode,
): Array<{ diagram: DiagramNode; ownerComponentUuid: string }> {
  const diagrams: Array<{ diagram: DiagramNode; ownerComponentUuid: string }> = []
  comp.useCaseDiagrams.forEach((ucDiagram) => {
    diagrams.push({ diagram: ucDiagram, ownerComponentUuid: comp.uuid })
    ucDiagram.useCases.forEach((useCase) => {
      useCase.sequenceDiagrams.forEach((seqDiagram) => {
        diagrams.push({ diagram: seqDiagram, ownerComponentUuid: comp.uuid })
      })
    })
  })
  comp.subComponents.forEach((c) => diagrams.push(...collectAllDiagrams(c)))
  return diagrams
}

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

function updateFunctionParams(
  comp: ComponentNode,
  functionUuid: string,
  newParams: Parameter[],
): ComponentNode {
  return {
    ...comp,
    interfaces: comp.interfaces.map((iface) => ({
      ...iface,
      functions: iface.functions.map((f) =>
        f.uuid === functionUuid ? { ...f, parameters: newParams } : f,
      ),
    })),
    subComponents: comp.subComponents.map((sub) =>
      updateFunctionParams(sub, functionUuid, newParams),
    ),
  }
}

function addFunctionToInterfaceByUuid(
  comp: ComponentNode,
  existingFunctionUuid: string,
  functionId: string,
  newParams: Parameter[],
): ComponentNode {
  const ifaceIdx =
    comp.interfaces?.findIndex((i) =>
      i.functions.some((f) => f.uuid === existingFunctionUuid),
    ) ?? -1
  if (ifaceIdx >= 0) {
    return {
      ...comp,
      interfaces: comp.interfaces.map((iface, idx) =>
        idx === ifaceIdx
          ? {
              ...iface,
              functions: [
                ...iface.functions,
                {
                  uuid: crypto.randomUUID(),
                  id: functionId,
                  parameters: newParams,
                },
              ],
            }
          : iface,
      ),
    }
  }
  return {
    ...comp,
    subComponents: comp.subComponents.map((sub) =>
      addFunctionToInterfaceByUuid(sub, existingFunctionUuid, functionId, newParams),
    ),
  }
}

function replaceSignatureInContent(
  content: string,
  interfaceId: string,
  functionId: string,
  newParams: Parameter[],
): string {
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    `(${escape(interfaceId)}:${escape(functionId)}\\()[^)]*\\)`,
    "g",
  )
  return content.replace(
    pattern,
    `${interfaceId}:${functionId}(${paramsToString(newParams)})`,
  )
}

function rebuildSystemDiagrams(system: ComponentNode): ComponentNode {
  let updatedSystem = system
  const allDiagrams = collectAllDiagrams(updatedSystem)

  allDiagrams.forEach(({ diagram, ownerComponentUuid }) => {
    if (!diagram.ownerComponentUuid) {
      updatedSystem = upsertTree(updatedSystem, diagram.uuid, (node) => ({
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

function findOwnerComponentUuid(root: ComponentNode, useCaseUuid: string): string | null {
  for (const diagram of root.useCaseDiagrams) {
    if (diagram.useCases.some(uc => uc.uuid === useCaseUuid)) {
      return diagram.ownerComponentUuid
    }
  }
  for (const sub of root.subComponents) {
    const found = findOwnerComponentUuid(sub, useCaseUuid)
    if (found) return found
  }
  return null
}

/** Find the id of any node, interface, or function by its uuid across the full tree. */
function findIdByUuid(root: ComponentNode, uuid: string): string | null {
  const searchComp = (comp: ComponentNode): string | null => {
    if (comp.uuid === uuid) return comp.id
    for (const a of comp.actors) if (a.uuid === uuid) return a.id
    for (const iface of comp.interfaces) {
      if (iface.uuid === uuid) return iface.id
      for (const fn of iface.functions) if (fn.uuid === uuid) return fn.id
    }
    for (const ucd of comp.useCaseDiagrams) {
      if (ucd.uuid === uuid) return ucd.id
      for (const uc of ucd.useCases) {
        if (uc.uuid === uuid) return uc.id
        for (const sd of uc.sequenceDiagrams) {
          if (sd.uuid === uuid) return sd.id
        }
      }
    }
    for (const sub of comp.subComponents) {
      const found = searchComp(sub)
      if (found !== null) return found
    }
    return null
  }
  return searchComp(root)
}

function removeInterfaceFunctions(comp: ComponentNode, uuidsToRemove: Set<string>): ComponentNode {
  if (uuidsToRemove.size === 0) return comp
  return {
    ...comp,
    interfaces: comp.interfaces.map((iface) => ({
      ...iface,
      functions: iface.functions.filter((f) => !uuidsToRemove.has(f.uuid)),
    })),
    subComponents: comp.subComponents.map((sub) => removeInterfaceFunctions(sub, uuidsToRemove)),
  }
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
  return removeInterfaceFunctions(system, toRemove)
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
    set((state) => ({
      past: pushPast(state.past, state.rootComponent),
      future: [],
      rootComponent: upsertTree(state.rootComponent, parentUuid, (parent) => {
        if (parent.type === "component") {
          switch (node.type) {
            case "component":
              return {
                ...parent,
                subComponents: [...parent.subComponents, node],
              }
            case "actor":
              return { ...parent, actors: [...parent.actors, node] }
            case "use-case-diagram": {
              return {
                ...parent,
                useCaseDiagrams: [
                  ...parent.useCaseDiagrams,
                  { ...node, ownerComponentUuid: parent.uuid, useCases: [] },
                ],
              }
            }
            default:
              return parent
          }
        }

        if (parent.type === "use-case-diagram") {
          if (node.type === "use-case") {
            return {
              ...parent,
              useCases: [...parent.useCases, { ...node, sequenceDiagrams: [] }],
            }
          }
          return parent
        }

        if (parent.type === "use-case") {
          if (node.type === "sequence-diagram") {
            const ownerUuid = findOwnerComponentUuid(state.rootComponent, parent.uuid) ?? state.rootComponent.uuid
            return {
              ...parent,
              sequenceDiagrams: [
                ...parent.sequenceDiagrams,
                { ...node, ownerComponentUuid: ownerUuid, referencedFunctionUuids: [] },
              ],
            }
          }
          return parent
        }

        return parent
      }),
    })),
  updateNode: (nodeUuid, updates) =>
    set((state) => {
      const updatedSystem = upsertTree(state.rootComponent, nodeUuid, (node) => ({ ...node, ...updates } as Node))
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
        rootComponent: deleteNodeRecursive(
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
          system = addFunctionToInterfaceByUuid(
            system,
            d.functionUuid,
            d.functionId,
            d.newParams,
          )
        } else {
          system = updateFunctionParams(system, d.functionUuid, d.newParams)
          for (const diagUuid of d.affectedDiagramUuids) {
            system = upsertTree(system, diagUuid, (node) => {
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

      const updatedWithContent = upsertTree(
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
