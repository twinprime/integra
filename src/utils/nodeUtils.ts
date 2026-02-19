import type { Node, SystemNode, ComponentNode } from "../store/types"

// Check if an actor or component is referenced in any diagram
export const isNodeOrphaned = (
  node: Node,
  parent: SystemNode | ComponentNode
): boolean => {
  if (node.type !== "actor" && node.type !== "component") {
    return false
  }

  const allDiagrams = [
    ...(parent.type === "system"
      ? (parent as SystemNode).useCaseDiagrams
      : (parent as ComponentNode).useCaseDiagrams),
    ...(parent.type === "system"
      ? (parent as SystemNode).sequenceDiagrams
      : (parent as ComponentNode).sequenceDiagrams),
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
  system: SystemNode,
  targetUuid: string
): SystemNode | ComponentNode | null => {
  const checkChildren = (
    node: SystemNode | ComponentNode
  ): SystemNode | ComponentNode | null => {
    const children = [
      ...(node.type === "system"
        ? (node as SystemNode).components
        : (node as ComponentNode).subComponents),
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
    const components =
      node.type === "system"
        ? (node as SystemNode).components
        : (node as ComponentNode).subComponents

    for (const comp of components) {
      const found = checkChildren(comp)
      if (found) return found
    }

    return null
  }

  return checkChildren(system)
}
