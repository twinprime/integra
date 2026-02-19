import { create } from "zustand"
import type {
  ComponentNode,
  Node,
  ActorNode,
  UseCaseNode,
  UseCaseDiagramNode,
  SequenceDiagramNode,
  BaseNode,
  DiagramNode,
} from "./types"

interface SystemState {
  rootComponent: ComponentNode
  selectedNodeId: string | null
  setSystem: (rootComponent: ComponentNode) => void
  selectNode: (nodeId: string | null) => void
  updateNode: (nodeId: string, updates: Partial<BaseNode> | any) => void
  addNode: (parentId: string, node: Node) => void
  deleteNode: (nodeId: string) => void
}

const initialSystem: ComponentNode = {
  uuid: "root-system-uuid",
  id: "root-system",
  name: "My System",
  type: "component",
  description: "Root System Component",
  subComponents: [],
  actors: [],
  useCases: [],
  useCaseDiagrams: [],
  sequenceDiagrams: [],
  interfaces: [],
}

// Helper to recursively find a node by uuid
export const findNode = (
  nodes: Node[] | BaseNode[],
  uuid: string
): Node | null => {
  for (const node of nodes) {
    if (node.uuid === uuid) return node as Node

    const anyNode = node as any
    const children = [
      ...(anyNode.components || []),
      ...(anyNode.subComponents || []),
      ...(anyNode.actors || []),
      ...(anyNode.useCases || []),
      ...(anyNode.useCaseDiagrams || []),
      ...(anyNode.sequenceDiagrams || []),
    ]

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
    const comp = node as ComponentNode
    return {
      ...comp,
      subComponents: comp.subComponents
        .filter((c) => c.uuid !== uuid)
        .map((c) => deleteNodeRecursive(c, uuid) as ComponentNode),
      actors: comp.actors.filter((a) => a.uuid !== uuid),
      useCases: comp.useCases.filter((u) => u.uuid !== uuid),
      useCaseDiagrams: comp.useCaseDiagrams.filter((d) => d.uuid !== uuid),
      sequenceDiagrams: comp.sequenceDiagrams.filter((d) => d.uuid !== uuid),
    }
  }

  return node
}

import { parseUseCaseDiagram } from "../utils/useCaseDiagramParser"
import { parseSequenceDiagram } from "../utils/sequenceDiagramParser"
import { upsertTree } from "../utils/diagramParserHelpers"

export const useSystemStore = create<SystemState>((set) => ({
  rootComponent: initialSystem,
  selectedNodeId: null,
  setSystem: (rootComponent) =>
    set(() => {
      // Parse all diagrams in the loaded system to rebuild referencedNodeIds and entities
      let updatedSystem = rootComponent

      // Helper to collect all diagrams with their parent UUIDs
      const collectDiagrams = (
        node: Node
      ): Array<{ diagram: DiagramNode; parentUuid: string }> => {
        const diagrams: Array<{ diagram: DiagramNode; parentUuid: string }> = []

        if (node.type === "component") {
          const comp = node as ComponentNode
          comp.useCaseDiagrams.forEach((d) =>
            diagrams.push({ diagram: d, parentUuid: comp.uuid })
          )
          comp.sequenceDiagrams.forEach((d) =>
            diagrams.push({ diagram: d, parentUuid: comp.uuid })
          )
          comp.subComponents.forEach((c) =>
            diagrams.push(...collectDiagrams(c))
          )
        }

        return diagrams
      }

      // Collect all diagrams
      const allDiagrams = collectDiagrams(updatedSystem)

      // Parse each diagram to rebuild referencedNodeIds
      allDiagrams.forEach(({ diagram, parentUuid }) => {
        if (diagram.content) {
          if (diagram.type === "use-case-diagram") {
            updatedSystem = parseUseCaseDiagram(
              diagram.content,
              updatedSystem,
              parentUuid,
              diagram.uuid
            ) as ComponentNode
          } else if (diagram.type === "sequence-diagram") {
            updatedSystem = parseSequenceDiagram(
              diagram.content,
              updatedSystem,
              parentUuid,
              diagram.uuid
            ) as ComponentNode
          }
        }
      })

      return { rootComponent: updatedSystem }
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  addNode: (parentUuid, node) =>
    set((state) => ({
      rootComponent: upsertTree(state.rootComponent, parentUuid, (parent) => {
        if (parent.type !== "component") return parent
        const comp = parent as ComponentNode
        switch (node.type) {
          case "component":
            return {
              ...comp,
              subComponents: [...comp.subComponents, node as ComponentNode],
            }
          case "actor":
            return { ...comp, actors: [...comp.actors, node as ActorNode] }
          case "use-case":
            return {
              ...comp,
              useCases: [...comp.useCases, node as UseCaseNode],
            }
          case "use-case-diagram":
            return {
              ...comp,
              useCaseDiagrams: [
                ...comp.useCaseDiagrams,
                node as UseCaseDiagramNode,
              ],
            }
          case "sequence-diagram":
            return {
              ...comp,
              sequenceDiagrams: [
                ...comp.sequenceDiagrams,
                node as SequenceDiagramNode,
              ],
            }
          default:
            return parent
        }
      }),
    })),
  updateNode: (nodeUuid, updates) =>
    set((state) => {
      // 1. First apply the explicit update
      const updatedSystem = upsertTree(
        state.rootComponent,
        nodeUuid,
        (node) => ({ ...node, ...updates })
      )

      // 2. Check if we updated a diagram content and need to parse
      // We need to find the node again in the NEW system to check type and content
      // Or we can check 'updates' if it contains 'content'
      // BUT we also need the parent component ID for parsing context.

      // Finding parent is expensive with current structure unless we store parent pointer.
      // Let's traverse to find parent of nodeUuid.
      const findParent = (
        root: Node,
        targetUuid: string
      ): ComponentNode | null => {
        if (root.type === "component") {
          const comp = root as ComponentNode
          for (const c of comp.subComponents) {
            if (c.uuid === targetUuid) return comp
            // ... check other children lists if we supported nested diagrams there ...
            const found = findParent(c, targetUuid)
            if (found) return found
          }
          if (comp.actors.find((a) => a.uuid === targetUuid)) return comp
          if (comp.useCases.find((u) => u.uuid === targetUuid)) return comp
          if (comp.useCaseDiagrams.find((d) => d.uuid === targetUuid)) return comp
          if (comp.sequenceDiagrams.find((d) => d.uuid === targetUuid)) return comp
        }
        return null
      }

      if (updates.content) {
        const parent = findParent(updatedSystem, nodeUuid)
        if (parent) {
          const node = findNode([updatedSystem], nodeUuid)
          if (node) {
            if (node.type === "use-case-diagram") {
              return {
                rootComponent: parseUseCaseDiagram(
                  updates.content,
                  updatedSystem,
                  parent.uuid,
                  nodeUuid
                ) as ComponentNode,
              }
            } else if (node.type === "sequence-diagram") {
              return {
                rootComponent: parseSequenceDiagram(
                  updates.content,
                  updatedSystem,
                  parent.uuid,
                  nodeUuid
                ) as ComponentNode,
              }
            }
          }
        }
      }

      return { rootComponent: updatedSystem }
    }),
  deleteNode: (nodeUuid) =>
    set((state) => {
      // If deleting the selected node, clear selection
      const newSelectedId = state.selectedNodeId === nodeUuid ? null : state.selectedNodeId
      return {
        rootComponent: deleteNodeRecursive(state.rootComponent, nodeUuid) as ComponentNode,
        selectedNodeId: newSelectedId,
      }
    }),
}))
