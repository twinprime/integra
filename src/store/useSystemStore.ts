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

// Helper to recursively find a node
export const findNode = (
  nodes: Node[] | BaseNode[],
  id: string
): Node | null => {
  for (const node of nodes) {
    if (node.id === id) return node as Node

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
      const found = findNode(children, id)
      if (found) return found
    }
  }
  return null
}

// Helper to recursively add a node
const addNodeRecursive = (
  node: Node,
  parentId: string,
  newNode: Node
): Node => {
  if (node.id === parentId) {
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
        (c) => addNodeRecursive(c, parentId, newNode) as ComponentNode
      ),
      actors:
        sys.actors?.map(
          (a) => addNodeRecursive(a, parentId, newNode) as ActorNode
        ) || [], // Safety check if existing state doesn't have it yet?
      // Actually spread will handle it if we strictly follow type but runtime state might be stale?
      // No, we reset initialSystem. But careful with existing trees if persistence was used (it's not).
      useCases:
        sys.useCases?.map(
          (u) => addNodeRecursive(u, parentId, newNode) as UseCaseNode
        ) || [],
      useCaseDiagrams:
        sys.useCaseDiagrams?.map(
          (d) => addNodeRecursive(d, parentId, newNode) as UseCaseDiagramNode
        ) || [],
      sequenceDiagrams:
        sys.sequenceDiagrams?.map(
          (d) => addNodeRecursive(d, parentId, newNode) as SequenceDiagramNode
        ) || [],
    }
  }

  if (node.type === "component") {
    const comp = node as ComponentNode
    return {
      ...comp,
      subComponents: comp.subComponents.map(
        (c) => addNodeRecursive(c, parentId, newNode) as ComponentNode
      ),
      // We don't recurse into other children for addNode strictly speaking unless they are containers?
      // Components are the only containers.
    }
  }

  return node
}

// Helper to recursively update a node
const updateNodeRecursive = (node: Node, id: string, updates: any): Node => {
  if (node.id === id) {
    return { ...node, ...updates }
  }

  if (node.type === "system") {
    const sys = node as SystemNode
    return {
      ...sys,
      components: sys.components.map(
        (c) => updateNodeRecursive(c, id, updates) as ComponentNode
      ),
      actors:
        sys.actors?.map(
          (a) => updateNodeRecursive(a, id, updates) as ActorNode
        ) || [],
      useCases:
        sys.useCases?.map(
          (u) => updateNodeRecursive(u, id, updates) as UseCaseNode
        ) || [],
      useCaseDiagrams:
        sys.useCaseDiagrams?.map(
          (d) => updateNodeRecursive(d, id, updates) as UseCaseDiagramNode
        ) || [],
      sequenceDiagrams:
        sys.sequenceDiagrams?.map(
          (d) => updateNodeRecursive(d, id, updates) as SequenceDiagramNode
        ) || [],
    }
  }

  if (node.type === "component") {
    const comp = node as ComponentNode
    return {
      ...comp,
      subComponents: comp.subComponents.map(
        (c) => updateNodeRecursive(c, id, updates) as ComponentNode
      ),
      actors: comp.actors.map(
        (a) => updateNodeRecursive(a, id, updates) as ActorNode
      ),
      useCases: comp.useCases.map(
        (u) => updateNodeRecursive(u, id, updates) as UseCaseNode
      ),
      useCaseDiagrams: comp.useCaseDiagrams.map(
        (d) => updateNodeRecursive(d, id, updates) as UseCaseDiagramNode
      ),
      sequenceDiagrams: comp.sequenceDiagrams.map(
        (d) => updateNodeRecursive(d, id, updates) as SequenceDiagramNode
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
  addNode: (parentId, node) =>
    set((state) => ({
      system: addNodeRecursive(state.system, parentId, node) as SystemNode,
    })),
  updateNode: (nodeId, updates) =>
    set((state) => {
      // 1. First apply the explicit update
      const updatedSystem = updateNodeRecursive(
        state.system,
        nodeId,
        updates
      ) as SystemNode

      // 2. Check if we updated a diagram content and need to parse
      // We need to find the node again in the NEW system to check type and content
      // Or we can check 'updates' if it contains 'content'
      // BUT we also need the parent component ID for parsing context.

      // Finding parent is expensive with current structure unless we store parent pointer.
      // Let's traverse to find parent of nodeId.
      const findParent = (
        root: Node,
        targetId: string
      ): ComponentNode | SystemNode | null => {
        if (root.type === "system") {
          const sys = root as SystemNode
          // Check direct children
          if (
            sys.components.find((c) => c.id === targetId) ||
            sys.actors?.find((a) => a.id === targetId) ||
            sys.useCases?.find((u) => u.id === targetId) ||
            sys.useCaseDiagrams?.find((d) => d.id === targetId) ||
            sys.sequenceDiagrams?.find((d) => d.id === targetId)
          ) {
            return sys
          }

          for (const c of sys.components) {
            const found = findParent(c, targetId)
            if (found) return found
          }
        }
        if (root.type === "component") {
          const comp = root as ComponentNode
          for (const c of comp.subComponents) {
            if (c.id === targetId) return comp
            // ... check other children lists if we supported nested diagrams there ...
            const found = findParent(c, targetId)
            if (found) return found
          }
          if (comp.actors.find((a) => a.id === targetId)) return comp
          if (comp.useCases.find((u) => u.id === targetId)) return comp
          if (comp.useCaseDiagrams.find((d) => d.id === targetId)) return comp
          if (comp.sequenceDiagrams.find((d) => d.id === targetId)) return comp
        }
        return null
      }

      if (updates.content) {
        const parent = findParent(updatedSystem, nodeId)
        if (parent) {
          const node = findNode([updatedSystem], nodeId) // Using existing helper but need to fix its signature or cast
          if (node) {
            if (node.type === "use-case-diagram") {
              return {
                system: parseUseCaseDiagram(
                  updates.content,
                  updatedSystem,
                  parent.id
                ),
              }
            } else if (node.type === "sequence-diagram") {
              return {
                system: parseSequenceDiagram(
                  updates.content,
                  updatedSystem,
                  parent.id
                ),
              }
            }
          }
        }
      }

      return { system: updatedSystem }
    }),
}))
