import type { Node, ComponentNode } from "../store/types"

// Check if an actor or component is referenced in any diagram
export const isNodeOrphaned = (
  node: Node,
  parent: ComponentNode
): boolean => {
  if (node.type !== "actor" && node.type !== "component") {
    return false
  }

  const allDiagrams = [
    ...parent.useCaseDiagrams,
    ...parent.sequenceDiagrams,
  ]

  // Check if the node's ID appears in any diagram's referencedNodeIds
  for (const diagram of allDiagrams) {
    if (diagram.referencedNodeIds && diagram.referencedNodeIds.includes(node.id)) {
      return false
    }
  }

  return true
}

// Find the parent of a node in the system tree
export const findParentNode = (
  rootComponent: ComponentNode,
  targetUuid: string
): ComponentNode | null => {
  const checkChildren = (
    node: ComponentNode
  ): ComponentNode | null => {
    const children = [
      ...node.subComponents,
      ...(node.actors || []),
      ...(node.useCases || []),
      ...(node.useCaseDiagrams || []),
      ...(node.sequenceDiagrams || []),
    ]

    for (const child of children) {
      if (child.uuid === targetUuid) {
        return node
      }
    }

    // Recurse into components
    for (const comp of node.subComponents) {
      const found = checkChildren(comp)
      if (found) return found
    }

    return null
  }

  return checkChildren(rootComponent)
}
