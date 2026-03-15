import type { Node, ComponentNode } from "../store/types"

/**
 * Operations every node type must support for generic tree traversal.
 * Implement this interface in each per-type module and register in nodeTree.ts.
 *
 * Adding a new node type:
 * 1. Create src/nodes/<type>Node.ts and export a handler: NodeHandler
 * 2. Add one entry to nodeHandlers in nodeTree.ts
 */
export interface NodeHandler {
  /**
   * When true, nodes of this type support deletion via the per-node delete icon.
   * `isNodeOrphaned` uses this to decide whether to apply the reference check.
   * Set this on any new node type that should be deletable.
   */
  canDelete?: boolean

  /**
   * When true, an unreferenced node of this type is considered a dead-weight orphan
   * and rendered with strikethrough styling in the tree.
   * Absent/false = the node is deletable when unreferenced but not styled as an orphan
   * (e.g. sequence diagrams are standalone artifacts, not dead weight).
   */
  orphanWhenUnreferenced?: boolean

  /** Return all direct children of this node. */
  getChildren(node: Node): ReadonlyArray<Node>

  /** Return a copy of this node with the child identified by uuid removed (recursively). */
  deleteChild(node: Node, uuid: string): Node

  /** Return a copy of this node with all children passed through updater (recursively). */
  upsertChild(node: Node, targetUuid: string, updater: (n: Node) => Node): Node

  /** Return the direct child whose id matches, or null. */
  getChildById(node: Node, id: string): Node | null

  /** Append this node type to a ComponentNode's appropriate child array.
   *  ownerCompUuid is passed for nodes that need to stamp ownerComponentUuid. */
  addToComponent(comp: ComponentNode, node: Node, ownerCompUuid: string): ComponentNode

  /** Return a copy of this node with child appended as a direct child.
   *  ownerCompUuid is the UUID of the nearest ComponentNode ancestor. */
  addChild(node: Node, child: Node, ownerCompUuid: string): Node
}
