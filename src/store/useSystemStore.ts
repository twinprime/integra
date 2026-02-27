import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ComponentNode, Node, DiagramNode, UseCaseDiagramNode, UseCaseNode, SequenceDiagramNode } from "./types"
import { parseUseCaseDiagram } from "../utils/useCaseDiagramParser"
import { parseSequenceDiagram } from "../utils/sequenceDiagramParser"
import { upsertTree } from "../utils/diagramParserHelpers"

interface SystemState {
  rootComponent: ComponentNode
  selectedNodeId: string | null
  parseError: string | null
  savedSnapshot: string | null
  setSystem: (rootComponent: ComponentNode) => void
  selectNode: (nodeId: string | null) => void
  updateNode: (nodeId: string, updates: Record<string, unknown>) => void
  addNode: (parentId: string, node: Node) => void
  deleteNode: (nodeId: string) => void
  clearParseError: () => void
  markSaved: (snapshot: string) => void
  clearSystem: () => void
}

const initialSystem: ComponentNode = {
  uuid: "root-component-uuid",
  id: "root-component",
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

export const useSystemStore = create<SystemState>()(
  persist(
    (set) => ({
  rootComponent: initialSystem,
  selectedNodeId: null,
  parseError: null,
  savedSnapshot: null,
  clearParseError: () => set({ parseError: null }),
  markSaved: (snapshot) => set({ savedSnapshot: snapshot }),
  clearSystem: () => set({ rootComponent: initialSystem, selectedNodeId: null, savedSnapshot: null }),
  setSystem: (rootComponent) =>
    set(() => ({
      rootComponent: rebuildSystemDiagrams(rootComponent),
    })),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  addNode: (parentUuid, node) =>
    set((state) => ({
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
      if (!updates.content) return { rootComponent: updatedSystem }
      return tryReparseContent(updates.content as string, updatedSystem, nodeUuid)
    }),
  deleteNode: (nodeUuid) =>
    set((state) => {
      const newSelectedId =
        state.selectedNodeId === nodeUuid ? null : state.selectedNodeId
      return {
        rootComponent: deleteNodeRecursive(
          state.rootComponent,
          nodeUuid,
        ) as ComponentNode,
        selectedNodeId: newSelectedId,
      }
    }),
  }),
  {
    name: "integra-system",
    partialize: (state) => ({ rootComponent: state.rootComponent }),
  }
))
