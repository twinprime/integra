import type { Node, ComponentNode, UseCaseDiagramNode, UseCaseNode, SequenceDiagramNode } from "../store/types"

// Collect all referencedFunctionUuids from every sequence diagram in the entire component tree
export const collectReferencedFunctionUuids = (root: ComponentNode): Set<string> => {
  const uuids = new Set<string>()
  const visitComp = (c: ComponentNode) => {
    c.useCaseDiagrams.forEach((d: UseCaseDiagramNode) => {
      d.useCases.forEach((uc) => {
        uc.sequenceDiagrams.forEach((sd: SequenceDiagramNode) => {
          sd.referencedFunctionUuids?.forEach((u) => uuids.add(u))
        })
      })
    })
    c.subComponents.forEach(visitComp)
  }
  visitComp(root)
  return uuids
}

// Check if an actor or component is referenced in any diagram
export const isNodeOrphaned = (
  node: Node,
  parent: ComponentNode
): boolean => {
  if (node.type !== "actor" && node.type !== "component") {
    return false
  }

  // Collect all diagrams (use case diagrams and sequence diagrams nested under use cases)
  const allDiagrams: Array<{ referencedNodeIds?: string[] }> = []
  
  parent.useCaseDiagrams.forEach((ucDiagram) => {
    allDiagrams.push(ucDiagram)
    ucDiagram.useCases.forEach((useCase) => {
      allDiagrams.push(...useCase.sequenceDiagrams)
    })
  })

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
): Node | null => {
  const searchRecursive = (
    node: Node
  ): Node | null => {
    if (node.type === "component") {
      const comp = node as ComponentNode
      const children = [
        ...comp.subComponents,
        ...(comp.actors || []),
        ...(comp.useCaseDiagrams || []),
      ]

      for (const child of children) {
        if (child.uuid === targetUuid) {
          return node
        }
      }

      // Recurse into sub-components
      for (const subComp of comp.subComponents) {
        const found = searchRecursive(subComp)
        if (found) return found
      }

      // Recurse into use case diagrams
      for (const diagram of comp.useCaseDiagrams) {
        const found = searchRecursive(diagram)
        if (found) return found
      }
    }

    if (node.type === "use-case-diagram") {
      const diagram = node as UseCaseDiagramNode
      for (const useCase of diagram.useCases) {
        if (useCase.uuid === targetUuid) {
          return node
        }
        const found = searchRecursive(useCase)
        if (found) return found
      }
    }

    if (node.type === "use-case") {
      const useCase = node as UseCaseNode
      for (const seqDiagram of useCase.sequenceDiagrams) {
        if (seqDiagram.uuid === targetUuid) {
          return node
        }
      }
    }

    return null
  }

  return searchRecursive(rootComponent)
}
