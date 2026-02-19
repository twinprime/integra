import type {
  ComponentNode,
  UseCaseDiagramNode,
  SequenceDiagramNode,
  Node,
  ActorNode,
  UseCaseNode,
} from "../store/types"

// Helper to find a component by UUID
export const findContainerInSystem = (
  rootComponent: ComponentNode,
  uuid: string
): ComponentNode | null => {
  if (rootComponent.uuid === uuid) return rootComponent

  const findRecursive = (nodes: ComponentNode[]): ComponentNode | null => {
    for (const node of nodes) {
      if (node.uuid === uuid) return node
      const found = findRecursive(node.subComponents)
      if (found) return found
    }
    return null
  }

  return findRecursive(rootComponent.subComponents)
}

// Generic tree update function that handles updating any node in the tree
export const upsertTree = (
  rootComponent: ComponentNode,
  targetUuid: string,
  updateFn: (node: Node) => Node
): ComponentNode => {
  const updateRecursive = (node: Node): Node => {
    // If this is the target node, apply the update
    if (node.uuid === targetUuid) {
      return updateFn(node)
    }

    // Recursively update children based on node type
    if (node.type === "component") {
      const comp = node as ComponentNode
      return {
        ...comp,
        subComponents: comp.subComponents.map(
          (c) => updateRecursive(c) as ComponentNode
        ),
        actors: comp.actors.map(
          (a) => updateRecursive(a) as ActorNode
        ),
        useCaseDiagrams: comp.useCaseDiagrams.map(
          (d) => updateRecursive(d) as UseCaseDiagramNode
        ),
      } as ComponentNode
    }

    if (node.type === "use-case-diagram") {
      const diagram = node as UseCaseDiagramNode
      return {
        ...diagram,
        useCases: diagram.useCases.map(
          (u) => updateRecursive(u) as UseCaseNode
        ),
      } as UseCaseDiagramNode
    }

    if (node.type === "use-case") {
      const useCase = node as UseCaseNode
      return {
        ...useCase,
        sequenceDiagrams: useCase.sequenceDiagrams.map(
          (d) => updateRecursive(d) as SequenceDiagramNode
        ),
      } as UseCaseNode
    }

    return node
  }

  return updateRecursive(rootComponent) as ComponentNode
}

// Helper to merge lists (update existing or append new)
export const mergeLists = <T extends { id: string; name: string }>(
  existing: T[],
  incoming: T[]
): T[] => {
  const result = [...existing]
  incoming.forEach((item) => {
    const index = result.findIndex((e) => e.id === item.id)
    if (index >= 0) {
      result[index] = { ...result[index], name: item.name }
    } else {
      result.push(item)
    }
  })
  return result
}
