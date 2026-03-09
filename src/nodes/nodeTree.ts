/**
 * nodeTree.ts — generic tree operations that dispatch to per-type node modules.
 *
 * All node-type dispatch goes through `nodeHandlers`. Adding a new node type requires:
 * 1. Creating src/nodes/<type>Node.ts and exporting a NodeHandler
 * 2. Adding one entry to `nodeHandlers` below
 *
 * TypeScript enforces completeness: `Record<Node['type'], NodeHandler>` is non-partial,
 * so omitting a type is a compile error.
 */
import type {
  ComponentNode,
  Node,
  ActorNode,
} from "../store/types"
import {
  collectDiagramsFromComponent,
  findIdInComponent,
  getSiblingIdsInComponent,
  findContainerComponentByUuid,
  findOwnerComponentUuidInComp,
  findParentInComponent,
  componentHandler,
} from "./componentNode"
import { ucDiagHandler } from "./useCaseDiagramNode"
import { useCaseHandler } from "./useCaseNode"
import type { NodeHandler } from "./nodeHandler"
import type { DiagramRef } from "./useCaseDiagramNode"

// ─── Handler registry ─────────────────────────────────────────────────────────

const noopLeafHandler: NodeHandler = {
  getChildren: () => [],
  deleteChild: (node) => node,
  upsertChild: (node) => node,
  getChildById: () => null,
  addToComponent: (comp) => comp,
  addChild: (node) => node,
}

const actorHandler: NodeHandler = {
  ...noopLeafHandler,
  canDelete: true,
  orphanWhenUnreferenced: true,
  addToComponent: (comp, node) => ({ ...comp, actors: [...comp.actors, node as ActorNode] }),
}

const nodeHandlers: Record<Node["type"], NodeHandler> = {
  component: componentHandler,
  "use-case-diagram": ucDiagHandler,
  "use-case": useCaseHandler,
  actor: actorHandler,
  "sequence-diagram": { ...noopLeafHandler, canDelete: true },
}

/** Returns the NodeHandler for the given node type. */
export const getNodeHandler = (type: Node["type"]): NodeHandler => nodeHandlers[type]

// ─── Children ────────────────────────────────────────────────────────────────

export const getNodeChildren = (node: Node): Node[] =>
  nodeHandlers[node.type].getChildren(node)

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

export const deleteNodeFromTree = (node: Node, uuid: string): Node =>
  nodeHandlers[node.type].deleteChild(node, uuid)

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
    return nodeHandlers[node.type].upsertChild(node, targetUuid, updateRecursive)
  }
  return updateRecursive(root) as ComponentNode
}

// ─── Add child ────────────────────────────────────────────────────────────────

/**
 * Append child to parent. For component parents, dispatches on child.type
 * (double dispatch) so each child handler knows which array it belongs in.
 */
export const addChildToNode = (parent: Node, child: Node, ownerCompUuid: string): Node => {
  if (parent.type === "component")
    return nodeHandlers[child.type].addToComponent(parent, child, ownerCompUuid)
  return nodeHandlers[parent.type].addChild(parent, child, ownerCompUuid)
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

// ─── Path traversal ───────────────────────────────────────────────────────────

export const traversePath = (node: Node, remaining: string[]): string | null => {
  if (remaining.length === 0) return node.uuid
  const [next, ...rest] = remaining
  const child = nodeHandlers[node.type].getChildById(node, next)
  return child ? traversePath(child, rest) : null
}

// ─── Parent lookup ────────────────────────────────────────────────────────────

export const findParentNode = (root: ComponentNode, targetUuid: string): Node | null =>
  findParentInComponent(root, targetUuid)

// ─── Component UUID lookup ────────────────────────────────────────────────────

export { findCompByUuid } from "./componentNode"

// ─── mergeLists (moved from diagramParserHelpers) ─────────────────────────────

export const mergeLists = <T extends { id: string; name: string }>(
  existing: T[],
  incoming: T[],
): T[] => {
  const result = [...existing]
  incoming.forEach((item) => {
    const index = result.findIndex((e) => e.id === item.id)
    if (index >= 0) {
      // Only update name if an explicit alias was provided (name differs from id).
      // When name === id the parser defaulted to the id — preserve any user-set name.
      if (item.name !== item.id) {
        result[index] = { ...result[index], name: item.name }
      }
    } else {
      result.push(item)
    }
  })
  return result
}

// Re-export types for convenience
export type { DiagramRef } from "./useCaseDiagramNode"
export type { NodeHandler } from "./nodeHandler"
export type { ComponentNode, Node, UseCaseDiagramNode, UseCaseNode, SequenceDiagramNode, ActorNode } from "../store/types"

export const findNode = findNodeByUuid
