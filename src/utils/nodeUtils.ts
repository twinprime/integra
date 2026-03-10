import type {
  Node,
  ComponentNode,
  UseCaseDiagramNode,
  SequenceDiagramNode,
} from "../store/types"
import {
  traversePath,
  findCompByUuid,
  getNodeChildren,
  getNodeHandler,
  collectAllDiagrams,
} from "../nodes/nodeTree"

// Collect all referencedFunctionUuids from every sequence diagram in the entire component tree
const collectFromUcDiag = (d: UseCaseDiagramNode, uuids: Set<string>): void => {
  d.useCases.forEach((uc) => {
    uc.sequenceDiagrams.forEach((sd: SequenceDiagramNode) => {
      sd.referencedFunctionUuids?.forEach((u) => uuids.add(u))
    })
  })
}

export const collectReferencedFunctionUuids = (
  root: ComponentNode,
): Set<string> => {
  const uuids = new Set<string>()
  const visitComp = (c: ComponentNode) => {
    c.useCaseDiagrams.forEach((d) => collectFromUcDiag(d, uuids))
    c.subComponents.forEach(visitComp)
  }
  visitComp(root)
  return uuids
}

// Check if a use case UUID is referenced in any sequence diagram across the entire tree
export const isUseCaseReferenced = (
  root: ComponentNode,
  useCaseUuid: string,
): boolean => {
  const check = (comp: ComponentNode): boolean => {
    for (const ucDiag of comp.useCaseDiagrams)
      for (const uc of ucDiag.useCases)
        for (const seq of uc.sequenceDiagrams)
          if (seq.referencedNodeIds.includes(useCaseUuid)) return true
    return comp.subComponents.some(check)
  }
  return check(root)
}

/**
 * Walk the full node tree via the registered getNodeChildren handlers and
 * check whether any node that carries referencedNodeIds references nodeUuid.
 * This is automatically future-proof: new diagram types only need to register
 * a NodeHandler (already required for all tree operations) and extend DiagramNode.
 */
const isNodeReferencedInAnyDiagram = (
  root: ComponentNode,
  nodeUuid: string,
): boolean => {
  const walk = (node: Node): boolean => {
    if (
      "referencedNodeIds" in node &&
      (node.referencedNodeIds as string[]).includes(nodeUuid)
    ) {
      return true
    }
    return getNodeChildren(node).some(walk)
  }
  return walk(root)
}

// Check if a node is safe to delete: must have canDelete on its handler and not be referenced anywhere
export const isNodeOrphaned = (node: Node, root: ComponentNode): boolean => {
  if (!getNodeHandler(node.type).canDelete) return false
  if (node.type === "use-case-diagram") {
    // A use-case-diagram UUID is never stored in referencedNodeIds; instead, protect by
    // checking whether any child use case is referenced in a sequence diagram.
    const ucd = node as UseCaseDiagramNode
    return ucd.useCases.every(uc => !isUseCaseReferenced(root, uc.uuid))
  }
  return !isNodeReferencedInAnyDiagram(root, node.uuid)
}

/** Return all diagrams (across the entire tree) whose referencedNodeIds includes nodeUuid. */
export const findReferencingDiagrams = (
  root: ComponentNode,
  nodeUuid: string,
): Array<{ uuid: string; name: string }> =>
  collectAllDiagrams(root)
    .filter(({ diagram }) => diagram.referencedNodeIds.includes(nodeUuid))
    .map(({ diagram }) => ({ uuid: diagram.uuid, name: diagram.name }))

// Find all direct children of a component that have a given id
// Searches: actors, subComponents, useCaseDiagrams (and their use cases and sequence diagrams)
const findInUcDiag = (d: UseCaseDiagramNode, nodeId: string): Node | null => {
  if (d.id === nodeId) return d
  for (const uc of d.useCases) {
    if (uc.id === nodeId) return uc
    for (const sd of uc.sequenceDiagrams) {
      if (sd.id === nodeId) return sd
    }
  }
  return null
}

export const findNodeInComponent = (
  comp: ComponentNode,
  nodeId: string,
): Node | null => {
  for (const a of comp.actors || []) {
    if (a.id === nodeId) return a
  }
  for (const c of comp.subComponents) {
    if (c.id === nodeId) return c
  }
  for (const d of comp.useCaseDiagrams) {
    const found = findInUcDiag(d, nodeId)
    if (found) return found
  }
  return null
}

// Find the nearest ancestor ComponentNode for a given node uuid
const isUcDiagDescendant = (d: UseCaseDiagramNode, uuid: string): boolean => {
  for (const uc of d.useCases) {
    if (uc.uuid === uuid) return true
    if (uc.sequenceDiagrams.some((sd) => sd.uuid === uuid)) return true
  }
  return false
}

export const findNearestComponentAncestor = (
  root: ComponentNode,
  targetUuid: string,
): ComponentNode | null => {
  const search = (comp: ComponentNode): ComponentNode | null => {
    const directChildren: Node[] = [
      ...(comp.actors || []),
      ...comp.subComponents,
      ...comp.useCaseDiagrams,
    ]
    if (directChildren.some((c) => c.uuid === targetUuid)) return comp
    if (comp.useCaseDiagrams.some((d) => isUcDiagDescendant(d, targetUuid)))
      return comp

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
//   - Multi-segment + contextComponentUuid: try relative to context component first, then absolute
//   - Multi-segment no context: absolute traversal from root (root.id prefix is optional)
// Returns the UUID of the found node, or null.
export const findNodeByPath = (
  root: ComponentNode,
  path: string,
  contextComponentUuid?: string,
): string | null => {
  const segments = path.split("/").filter(Boolean)
  if (segments.length === 0) return null

  if (contextComponentUuid) {
    const contextComp = findCompByUuid(root, contextComponentUuid)
    if (contextComp) {
      if (segments.length === 1) {
        const node = findNodeInComponent(contextComp, segments[0])
        if (node) return node.uuid
      } else {
        const result = traversePath(contextComp, segments)
        if (result) return result
      }
    }
  }

  const [first, ...rest] = segments
  if (root.id === first) return traversePath(root, rest)
  return traversePath(root, segments)
}

// ─── Scope utilities ──────────────────────────────────────────────────────────

/**
 * Returns true when candidateCompUuid is any descendant of comp (recursive).
 */
const isDescendantOf = (comp: ComponentNode, candidateUuid: string): boolean =>
  comp.subComponents.some(
    (c) => c.uuid === candidateUuid || isDescendantOf(c, candidateUuid),
  )

/**
 * Returns the ancestor chain of ownerComp from immediate parent up to (and including) root.
 * Returns an empty array when ownerComp is the root.
 */
export const getAncestorComponentChain = (
  root: ComponentNode,
  ownerCompUuid: string,
): ComponentNode[] => {
  if (root.uuid === ownerCompUuid) return []
  const chain: ComponentNode[] = []
  let currentUuid = ownerCompUuid
  while (true) {
    const parent = findNearestComponentAncestor(root, currentUuid)
    if (!parent || parent.uuid === currentUuid) break
    chain.push(parent)
    if (parent.uuid === root.uuid) break
    currentUuid = parent.uuid
  }
  return chain
}

/**
 * Returns the absolute path from root to the component as a slash-joined string.
 * e.g. root → "root", root/svc/db → "root/svc/db"
 */
export const getComponentAbsolutePath = (
  root: ComponentNode,
  compUuid: string,
): string => {
  if (root.uuid === compUuid) return root.id
  const ancestors = getAncestorComponentChain(root, compUuid)
  const comp = findCompByUuid(root, compUuid)
  if (!comp) return ""
  return [...ancestors]
    .reverse()
    .concat(comp)
    .map((c) => c.id)
    .join("/")
}

/**
 * Returns true when candidateCompUuid is in scope for a diagram owned by ownerComp:
 *   - ownerComp itself
 *   - any descendant of ownerComp (children, grandchildren, etc.)
 *   - any ancestor of ownerComp
 *   - a direct child of any ancestor (siblings, uncles/aunts, etc.) — but NOT their children
 */
export const isInScope = (
  root: ComponentNode,
  ownerCompUuid: string,
  candidateCompUuid: string,
): boolean => {
  if (candidateCompUuid === ownerCompUuid) return true
  const ownerComp = findCompByUuid(root, ownerCompUuid)
  if (ownerComp && isDescendantOf(ownerComp, candidateCompUuid)) return true
  const ancestors = getAncestorComponentChain(root, ownerCompUuid)
  for (const ancestor of ancestors) {
    if (ancestor.uuid === candidateCompUuid) return true
    if (ancestor.subComponents.some((c) => c.uuid === candidateCompUuid))
      return true
  }
  return false
}
