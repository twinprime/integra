import type { ComponentNode, InterfaceFunction, InterfaceSpecification } from "../store/types"
import { findParentNode } from "../nodes/nodeTree"

/**
 * Returns the effective readable function list for an interface.
 *
 * Inherited interfaces may store an empty local `functions` array and source their
 * function contract from the parent interface instead. Read/lookup/render paths
 * should use this helper instead of reading `iface.functions` directly.
 */
export function resolveEffectiveInterfaceFunctions(
  iface: InterfaceSpecification,
  ownerComp: ComponentNode,
  rootComponent: ComponentNode,
): InterfaceFunction[] {
  if (!iface.parentInterfaceUuid) return iface.functions
  const parentNode = findParentNode(rootComponent, ownerComp.uuid)
  if (parentNode?.type !== "component") return iface.functions
  const parentIface = parentNode.interfaces.find((candidate) => candidate.uuid === iface.parentInterfaceUuid)
  return parentIface?.functions ?? iface.functions
}
