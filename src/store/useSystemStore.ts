import { create } from "zustand"
import type { ComponentNode, Node, BaseNode, DiagramNode, UseCaseDiagramNode } from "./types"

interface SystemState {
  rootComponent: ComponentNode
  selectedNodeId: string | null
  parseError: string | null
  setSystem: (rootComponent: ComponentNode) => void
  selectNode: (nodeId: string | null) => void
  updateNode: (nodeId: string, updates: Partial<BaseNode> | any) => void
  addNode: (parentId: string, node: Node) => void
  deleteNode: (nodeId: string) => void
  clearParseError: () => void
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

// Helper to recursively find a node by uuid
export const findNode = (
  nodes: Node[] | BaseNode[],
  uuid: string,
): Node | null => {
  for (const node of nodes) {
    if (node.uuid === uuid) return node as Node

    const anyNode = node as any
    const children = [
      ...(anyNode.subComponents || []),
      ...(anyNode.actors || []),
      ...(anyNode.useCaseDiagrams || []),
      ...(anyNode.useCases || []),        // UseCaseDiagramNode has useCases
      ...(anyNode.sequenceDiagrams || []), // UseCaseNode has sequenceDiagrams
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
      useCaseDiagrams: comp.useCaseDiagrams
        .filter((d) => d.uuid !== uuid)
        .map((d) => deleteNodeRecursive(d, uuid) as UseCaseDiagramNode),
    }
  }

  if (node.type === "use-case-diagram") {
    const diagram = node as any
    return {
      ...diagram,
      useCases: (diagram.useCases || [])
        .filter((u: any) => u.uuid !== uuid)
        .map((u: any) => deleteNodeRecursive(u, uuid)),
    }
  }

  if (node.type === "use-case") {
    const useCase = node as any
    return {
      ...useCase,
      sequenceDiagrams: (useCase.sequenceDiagrams || [])
        .filter((d: any) => d.uuid !== uuid)
        .map((d: any) => deleteNodeRecursive(d, uuid)),
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
  parseError: null,
  clearParseError: () => set({ parseError: null }),
  setSystem: (rootComponent) =>
    set(() => {
      // Parse all diagrams in the loaded system to rebuild referencedNodeIds and entities
      // Also ensure all diagrams have ownerComponentUuid set
      let updatedSystem = rootComponent

      // Helper to collect all diagrams with their owner component UUIDs
      const collectDiagrams = (
        node: Node,
      ): Array<{ diagram: DiagramNode; ownerComponentUuid: string }> => {
        const diagrams: Array<{ diagram: DiagramNode; ownerComponentUuid: string }> = []

        if (node.type === "component") {
          const comp = node as ComponentNode
          // Use case diagrams belong to this component
          comp.useCaseDiagrams.forEach((ucDiagram) => {
            diagrams.push({ diagram: ucDiagram, ownerComponentUuid: comp.uuid })
            // Collect use cases and their sequence diagrams
            ucDiagram.useCases.forEach((useCase) => {
              useCase.sequenceDiagrams.forEach((seqDiagram) => {
                diagrams.push({ diagram: seqDiagram, ownerComponentUuid: comp.uuid })
              })
            })
          })
          // Recurse into sub-components
          comp.subComponents.forEach((c) =>
            diagrams.push(...collectDiagrams(c)),
          )
        }

        return diagrams
      }

      // Collect all diagrams
      const allDiagrams = collectDiagrams(updatedSystem)

      // First ensure all diagrams have ownerComponentUuid set
      allDiagrams.forEach(({ diagram, ownerComponentUuid }) => {
        if (!diagram.ownerComponentUuid) {
          updatedSystem = upsertTree(updatedSystem, diagram.uuid, (node) => ({
            ...node,
            ownerComponentUuid,
          }))
        }
      })

      // Parse each diagram to rebuild referencedNodeIds
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

      return { rootComponent: updatedSystem }
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  addNode: (parentUuid, node) =>
    set((state) => ({
      rootComponent: upsertTree(state.rootComponent, parentUuid, (parent) => {
        // Handle adding to component
        if (parent.type === "component") {
          const comp = parent as ComponentNode
          switch (node.type) {
            case "component":
              return {
                ...comp,
                subComponents: [...comp.subComponents, node as ComponentNode],
              }
            case "actor":
              return { ...comp, actors: [...comp.actors, node as any] }
            case "use-case-diagram":
              // Set ownerComponentUuid when adding diagram
              const ucDiagram = node as any
              return {
                ...comp,
                useCaseDiagrams: [
                  ...comp.useCaseDiagrams,
                  { ...ucDiagram, ownerComponentUuid: comp.uuid, useCases: [] },
                ],
              }
            default:
              return parent
          }
        }

        // Handle adding to use case diagram
        if (parent.type === "use-case-diagram") {
          const diagram = parent as any
          if (node.type === "use-case") {
            return {
              ...diagram,
              useCases: [...(diagram.useCases || []), { ...node, sequenceDiagrams: [] }],
            }
          }
          return parent
        }

        // Handle adding to use case
        if (parent.type === "use-case") {
          const useCase = parent as any
          if (node.type === "sequence-diagram") {
            // Get ownerComponentUuid from the use case diagram
            // We need to find the diagram that contains this use case
            const findOwnerComponent = (root: ComponentNode, targetUseCase: string): string | null => {
              for (const diagram of root.useCaseDiagrams) {
                if (diagram.useCases.some(uc => uc.uuid === targetUseCase)) {
                  return diagram.ownerComponentUuid
                }
              }
              for (const sub of root.subComponents) {
                const found = findOwnerComponent(sub, targetUseCase)
                if (found) return found
              }
              return null
            }
            
            const ownerUuid = findOwnerComponent(state.rootComponent, useCase.uuid) || state.rootComponent.uuid
            const seqDiagram = node as any
            return {
              ...useCase,
              sequenceDiagrams: [
                ...(useCase.sequenceDiagrams || []),
                { ...seqDiagram, ownerComponentUuid: ownerUuid, referencedFunctionUuids: [] },
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
      // 1. First apply the explicit update
      const updatedSystem = upsertTree(
        state.rootComponent,
        nodeUuid,
        (node) => ({ ...node, ...updates }),
      )

      // 2. Check if we updated a diagram content and need to parse
      if (updates.content) {
        const node = findNode([updatedSystem], nodeUuid)
        if (node && (node.type === "use-case-diagram" || node.type === "sequence-diagram")) {
          const diagram = node as DiagramNode
          // Use the ownerComponentUuid stored in the diagram
          if (diagram.ownerComponentUuid) {
            if (node.type === "use-case-diagram") {
              try {
                return {
                  rootComponent: parseUseCaseDiagram(
                    updates.content,
                    updatedSystem,
                    diagram.ownerComponentUuid,
                    nodeUuid,
                  ),
                  parseError: null,
                }
              } catch (err: any) {
                return { parseError: err.message }
              }
            } else if (node.type === "sequence-diagram") {
              try {
                return {
                  rootComponent: parseSequenceDiagram(
                    updates.content,
                    updatedSystem,
                    diagram.ownerComponentUuid,
                    nodeUuid,
                  ),
                  parseError: null,
                }
              } catch (err: any) {
                return { parseError: err.message }
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
}))
