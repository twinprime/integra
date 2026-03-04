/**
 * nodeTree.ts — generic tree operations that dispatch to per-type node modules.
 *
 * This is the functional equivalent of polymorphic dispatch: each function
 * switches on `node.type` and delegates to the appropriate per-type module.
 * Adding a new node type only requires updating this file and the relevant
 * per-type module.
 */
import type {
  ComponentNode,
  Node,
  UseCaseDiagramNode,
  UseCaseNode,
  SequenceDiagramNode,
  ActorNode,
} from "../store/types"
import {
  getComponentChildren,
  deleteFromComponent,
  upsertInComponent,
  collectDiagramsFromComponent,
  findIdInComponent,
  getSiblingIdsInComponent,
  applyIdRenameInComponent,
  findContainerComponentByUuid,
  findOwnerComponentUuidInComp,
} from "./componentNode"
import { getUcDiagChildren, deleteFromUcDiag, upsertInUcDiag } from "./useCaseDiagramNode"
import {
  getUseCaseChildren,
  deleteFromUseCase,
  upsertInUseCase,
} from "./useCaseNode"
import type { DiagramRef } from "./useCaseDiagramNode"

// ─── Children ────────────────────────────────────────────────────────────────

export const getNodeChildren = (node: Node): Node[] => {
  switch (node.type) {
    case "component": return getComponentChildren(node)
    case "use-case-diagram": return getUcDiagChildren(node)
    case "use-case": return getUseCaseChildren(node)
    default: return []
  }
}

// ─── Find ─────────────────────────────────────────────────────────────────────

export const findNodeByUuid = (nodes: Node[], uuid: string): Node | null => {
  for (const node of nodes) {
    if (node.uuid === uuid) return node
    const children = getNodeChildren(node)
    if (children.length > 0) {
      const found = findNodeByUuid(children, uuid)
      if (found) return found
    }
  }
  return null
}

/** Find the id of any node, interface, or function across the full tree. */
export const findIdByUuid = (root: ComponentNode, uuid: string): string | null =>
  findIdInComponent(root, uuid)

// ─── Delete ───────────────────────────────────────────────────────────────────

export const deleteNodeFromTree = (node: Node, uuid: string): Node => {
  switch (node.type) {
    case "component":
      return deleteFromComponent(node, uuid)
    case "use-case-diagram":
      return deleteFromUcDiag(node as UseCaseDiagramNode, uuid)
    case "use-case":
      return deleteFromUseCase(node as UseCaseNode, uuid)
    default:
      return node
  }
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Generic tree update: find the node with targetUuid and apply updater.
 * Traverses all node types recursively.
 */
export const upsertNodeInTree = (
  root: ComponentNode,
  targetUuid: string,
  updater: (node: Node) => Node,
): ComponentNode => {
  const updateRecursive = (node: Node): Node => {
    if (node.uuid === targetUuid) return updater(node)
    switch (node.type) {
      case "component":
        return upsertInComponent(node, targetUuid, updateRecursive)
      case "use-case-diagram":
        return upsertInUcDiag(node as UseCaseDiagramNode, targetUuid, updateRecursive)
      case "use-case":
        return upsertInUseCase(node as UseCaseNode, targetUuid, updateRecursive)
      default:
        return node
    }
  }
  return updateRecursive(root) as ComponentNode
}

// ─── Collect diagrams ─────────────────────────────────────────────────────────

export const collectAllDiagrams = (root: ComponentNode): DiagramRef[] =>
  collectDiagramsFromComponent(root)

// ─── Sibling IDs ──────────────────────────────────────────────────────────────

export const getNodeSiblingIds = (root: ComponentNode, uuid: string): string[] => {
  if (root.uuid === uuid) return []
  return getSiblingIdsInComponent(root, uuid) ?? []
}

// ─── Owner component ──────────────────────────────────────────────────────────

export const findOwnerComponentUuid = (
  root: ComponentNode,
  useCaseUuid: string,
): string | null => findOwnerComponentUuidInComp(root, useCaseUuid)

// ─── Find container (component node by UUID) ──────────────────────────────────

export const findContainerInSystem = (
  root: ComponentNode,
  uuid: string,
): ComponentNode | null => findContainerComponentByUuid(root, uuid)

// ─── mergeLists (moved from diagramParserHelpers) ─────────────────────────────

export const mergeLists = <T extends { id: string; name: string }>(
  existing: T[],
  incoming: T[],
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

// Re-export types for convenience
export type { DiagramRef }
export type { ComponentNode, Node, UseCaseDiagramNode, UseCaseNode, SequenceDiagramNode, ActorNode }
