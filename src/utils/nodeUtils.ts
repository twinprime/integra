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

// Check if a use case UUID is referenced in any sequence diagram across the entire tree
export const isUseCaseReferenced = (root: ComponentNode, useCaseUuid: string): boolean => {
  const check = (comp: ComponentNode): boolean => {
    for (const ucDiag of comp.useCaseDiagrams)
      for (const uc of ucDiag.useCases)
        for (const seq of uc.sequenceDiagrams)
          if (seq.referencedNodeIds.includes(useCaseUuid)) return true
    return comp.subComponents.some(check)
  }
  return check(root)
}

// Check if an actor or component is referenced in any diagram across the entire tree
export const isNodeOrphaned = (
  node: Node,
  root: ComponentNode
): boolean => {
  if (node.type !== "actor" && node.type !== "component") {
    return false
  }
  return !isUseCaseReferenced(root, node.uuid)
}

// Find all direct children of a component that have a given id
// Searches: actors, subComponents, useCaseDiagrams (and their use cases and sequence diagrams)
export const findNodeInComponent = (comp: ComponentNode, nodeId: string): Node | null => {
  for (const a of comp.actors || []) {
    if (a.id === nodeId) return a
  }
  for (const c of comp.subComponents) {
    if (c.id === nodeId) return c
  }
  for (const d of comp.useCaseDiagrams) {
    if (d.id === nodeId) return d
    for (const uc of d.useCases) {
      if (uc.id === nodeId) return uc
      for (const sd of uc.sequenceDiagrams) {
        if (sd.id === nodeId) return sd
      }
    }
  }
  return null
}

// Find the nearest ancestor ComponentNode for a given node uuid
export const findNearestComponentAncestor = (
  root: ComponentNode,
  targetUuid: string
): ComponentNode | null => {
  const search = (comp: ComponentNode): ComponentNode | null => {
    // Check direct children
    const directChildren: Node[] = [
      ...(comp.actors || []),
      ...comp.subComponents,
      ...comp.useCaseDiagrams,
    ]
    if (directChildren.some((c) => c.uuid === targetUuid)) return comp

    // Check use case diagrams and their children
    for (const d of comp.useCaseDiagrams) {
      for (const uc of d.useCases) {
        if (uc.uuid === targetUuid) return comp
        for (const sd of uc.sequenceDiagrams) {
          if (sd.uuid === targetUuid) return comp
        }
      }
    }

    // Recurse into sub-components
    for (const sub of comp.subComponents) {
      const found = search(sub)
      if (found) return found
    }

    return null
  }

  if (root.uuid === targetUuid) return root
  return search(root)
}

// Find a node by a slash-separated path.
// Path semantics:
//   - Single segment + contextComponentUuid: resolve within that component, fall back to full tree
//   - Multi-segment: each segment is a node ID at successive levels of the tree
//     (component → subComponent/actor/diagram → useCase → sequenceDiagram)
// Returns the UUID of the found node, or null.
export const findNodeByPath = (
  root: ComponentNode,
  path: string,
  contextComponentUuid?: string
): string | null => {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return null

  // Single segment: try to resolve within the context component first
  if (segments.length === 1 && contextComponentUuid) {
    const findComp = (c: ComponentNode): ComponentNode | null => {
      if (c.uuid === contextComponentUuid) return c
      for (const sub of c.subComponents) {
        const found = findComp(sub)
        if (found) return found
      }
      return null
    }
    const contextComp = findComp(root)
    if (contextComp) {
      const node = findNodeInComponent(contextComp, segments[0])
      if (node) return node.uuid
    }
  }

  // Multi-segment or fallback: traverse the tree level by level
  const traverse = (node: Node, remaining: string[]): string | null => {
    if (remaining.length === 0) return node.uuid
    const [next, ...rest] = remaining

    if (node.type === 'component') {
      const comp = node as ComponentNode
      const children: Node[] = [...comp.subComponents, ...(comp.actors || []), ...(comp.useCaseDiagrams || [])]
      for (const child of children) {
        if (child.id === next) return traverse(child, rest)
      }
    }
    if (node.type === 'use-case-diagram') {
      const d = node as UseCaseDiagramNode
      for (const uc of d.useCases) {
        if (uc.id === next) return traverse(uc, rest)
      }
    }
    if (node.type === 'use-case') {
      const uc = node as UseCaseNode
      for (const sd of uc.sequenceDiagrams) {
        if (sd.id === next) return traverse(sd, rest)
      }
    }
    return null
  }

  const [first, ...rest] = segments
  if (root.id === first) return traverse(root, rest)
  return traverse(root, segments)
}



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
