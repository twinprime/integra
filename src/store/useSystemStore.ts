import { create } from "zustand"
import type {
  SystemNode,
  ComponentNode,
  Node,
  ActorNode,
  UseCaseNode,
  UseCaseDiagramNode,
  SequenceDiagramNode,
  BaseNode,
} from "./types"

interface SystemState {
  system: SystemNode
  selectedNodeId: string | null
  setSystem: (system: SystemNode) => void
  selectNode: (nodeId: string | null) => void
  updateNode: (nodeId: string, updates: Partial<BaseNode> | any) => void
  addNode: (parentId: string, node: Node) => void
}

const initialSystem: SystemNode = {
  uuid: "root-system-uuid",
  id: "root-system",
  name: "My System",
  type: "system",
  description: "Root System Node",
  components: [],
  actors: [],
  useCases: [],
  useCaseDiagrams: [],
  sequenceDiagrams: [],
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

// Helper to recursively add a node
const addNodeRecursive = (
  node: Node,
  parentUuid: string,
  newNode: Node
): Node => {
  if (node.uuid === parentUuid) {
    if (node.type === "system") {
      const sys = node as SystemNode
      switch (newNode.type) {
        case "component":
          return {
            ...sys,
            components: [...sys.components, newNode as ComponentNode],
          }
        case "actor":
          return { ...sys, actors: [...sys.actors, newNode as ActorNode] }
        case "use-case":
          return { ...sys, useCases: [...sys.useCases, newNode as UseCaseNode] }
        case "use-case-diagram":
          return {
            ...sys,
            useCaseDiagrams: [
              ...sys.useCaseDiagrams,
              newNode as UseCaseDiagramNode,
            ],
          }
        case "sequence-diagram":
          return {
            ...sys,
            sequenceDiagrams: [
              ...sys.sequenceDiagrams,
              newNode as SequenceDiagramNode,
            ],
          }
      }
    }

    if (node.type === "component") {
      const comp = node as ComponentNode
      switch (newNode.type) {
        case "component":
          return {
            ...comp,
            subComponents: [...comp.subComponents, newNode as ComponentNode],
          }
        case "actor":
          return { ...comp, actors: [...comp.actors, newNode as ActorNode] }
        case "use-case":
          return {
            ...comp,
            useCases: [...comp.useCases, newNode as UseCaseNode],
          }
        case "use-case-diagram":
          return {
            ...comp,
            useCaseDiagrams: [
              ...comp.useCaseDiagrams,
              newNode as UseCaseDiagramNode,
            ],
          }
        case "sequence-diagram":
          return {
            ...comp,
            sequenceDiagrams: [
              ...comp.sequenceDiagrams,
              newNode as SequenceDiagramNode,
            ],
          }
      }
    }
  }

  // Recursive step
  if (node.type === "system") {
    const sys = node as SystemNode
    return {
      ...sys,
      components: sys.components.map(
        (c) => addNodeRecursive(c, parentUuid, newNode) as ComponentNode
      ),
      actors:
        sys.actors?.map(
          (a) => addNodeRecursive(a, parentUuid, newNode) as ActorNode
        ) || [], // Safety check if existing state doesn't have it yet?
      // Actually spread will handle it if we strictly follow type but runtime state might be stale?
      // No, we reset initialSystem. But careful with existing trees if persistence was used (it's not).
      useCases:
        sys.useCases?.map(
          (u) => addNodeRecursive(u, parentUuid, newNode) as UseCaseNode
        ) || [],
      useCaseDiagrams:
        sys.useCaseDiagrams?.map(
          (d) => addNodeRecursive(d, parentUuid, newNode) as UseCaseDiagramNode
        ) || [],
      sequenceDiagrams:
        sys.sequenceDiagrams?.map(
          (d) => addNodeRecursive(d, parentUuid, newNode) as SequenceDiagramNode
        ) || [],
    }
  }

  if (node.type === "component") {
    const comp = node as ComponentNode
    return {
      ...comp,
      subComponents: comp.subComponents.map(
        (c) => addNodeRecursive(c, parentUuid, newNode) as ComponentNode
      ),
      // We don't recurse into other children for addNode strictly speaking unless they are containers?
      // Components are the only containers.
    }
  }

  return node
}

// Helper to recursively update a node
const updateNodeRecursive = (node: Node, uuid: string, updates: any): Node => {
  if (node.uuid === uuid) {
    return { ...node, ...updates }
  }

  if (node.type === "system") {
    const sys = node as SystemNode
    return {
      ...sys,
      components: sys.components.map(
        (c) => updateNodeRecursive(c, uuid, updates) as ComponentNode
      ),
      actors:
        sys.actors?.map(
          (a) => updateNodeRecursive(a, uuid, updates) as ActorNode
        ) || [],
      useCases:
        sys.useCases?.map(
          (u) => updateNodeRecursive(u, uuid, updates) as UseCaseNode
        ) || [],
      useCaseDiagrams:
        sys.useCaseDiagrams?.map(
          (d) => updateNodeRecursive(d, uuid, updates) as UseCaseDiagramNode
        ) || [],
      sequenceDiagrams:
        sys.sequenceDiagrams?.map(
          (d) => updateNodeRecursive(d, uuid, updates) as SequenceDiagramNode
        ) || [],
    }
  }

  if (node.type === "component") {
    const comp = node as ComponentNode
    return {
      ...comp,
      subComponents: comp.subComponents.map(
        (c) => updateNodeRecursive(c, uuid, updates) as ComponentNode
      ),
      actors: comp.actors.map(
        (a) => updateNodeRecursive(a, uuid, updates) as ActorNode
      ),
      useCases: comp.useCases.map(
        (u) => updateNodeRecursive(u, uuid, updates) as UseCaseNode
      ),
      useCaseDiagrams: comp.useCaseDiagrams.map(
        (d) => updateNodeRecursive(d, uuid, updates) as UseCaseDiagramNode
      ),
      sequenceDiagrams: comp.sequenceDiagrams.map(
        (d) => updateNodeRecursive(d, uuid, updates) as SequenceDiagramNode
      ),
    }
  }

  return node
}

import {
  parseUseCaseDiagram,
  parseSequenceDiagram,
} from "../utils/diagramParser"

export const useSystemStore = create<SystemState>((set) => ({
  system: initialSystem,
  selectedNodeId: null,
  setSystem: (system) => set({ system }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  addNode: (parentUuid, node) =>
    set((state) => ({
      system: addNodeRecursive(state.system, parentUuid, node) as SystemNode,
    })),
  updateNode: (nodeUuid, updates) =>
    set((state) => {
      // 1. First apply the explicit update
      const updatedSystem = updateNodeRecursive(
        state.system,
        nodeUuid,
        updates
      ) as SystemNode

      // 2. Check if we updated a diagram content and need to parse
      // We need to find the node again in the NEW system to check type and content
      // Or we can check 'updates' if it contains 'content'
      // BUT we also need the parent component ID for parsing context.

      // Finding parent is expensive with current structure unless we store parent pointer.
      // Let's traverse to find parent of nodeUuid.
      const findParent = (
        root: Node,
        targetUuid: string
      ): ComponentNode | SystemNode | null => {
        if (root.type === "system") {
          const sys = root as SystemNode
          // Check direct children
          if (
            sys.components.find((c) => c.uuid === targetUuid) ||
            sys.actors?.find((a) => a.uuid === targetUuid) ||
            sys.useCases?.find((u) => u.uuid === targetUuid) ||
            sys.useCaseDiagrams?.find((d) => d.uuid === targetUuid) ||
            sys.sequenceDiagrams?.find((d) => d.uuid === targetUuid)
          ) {
            return sys
          }

          for (const c of sys.components) {
            const found = findParent(c, targetUuid)
            if (found) return found
          }
        }
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
          const node = findNode([updatedSystem], nodeUuid) // Using existing helper but need to fix its signature or cast
          if (node) {
            if (node.type === "use-case-diagram") {
              return {
                system: parseUseCaseDiagram(
                  updates.content,
                  updatedSystem,
                  parent.uuid
                ),
              }
            } else if (node.type === "sequence-diagram") {
              return {
                system: parseSequenceDiagram(
                  updates.content,
                  updatedSystem,
                  parent.uuid
                ),
              }
            }
          }
        }
      }

      return { system: updatedSystem }
    }),
}))
