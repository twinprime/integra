import type { ComponentNode } from "../store/types"
import { findNodeByPath } from "./nodeUtils"
import { findCompByUuid } from "../nodes/nodeTree"

export function resolveInOwner(
  ownerComp: ComponentNode,
  id: string,
): string | undefined {
  if (ownerComp.id === id) return ownerComp.uuid
  return (
    ownerComp.actors?.find((a) => a.id === id)?.uuid ??
    ownerComp.subComponents?.find((c) => c.id === id)?.uuid ??
    undefined
  )
}

export function resolveUseCaseInOwner(
  ownerComp: ComponentNode,
  id: string,
): string | undefined {
  for (const d of ownerComp.useCaseDiagrams) {
    const uc = d.useCases?.find((u) => u.id === id)
    if (uc) return uc.uuid
  }
  return undefined
}

export function resolveParticipant(
  keyword: string,
  id: string,
  fromPath: string | undefined,
  root: ComponentNode,
  ownerComp: ComponentNode | null,
): string | undefined {
  if (fromPath) return findNodeByPath(root, fromPath) ?? undefined
  if (!ownerComp) return undefined
  if (keyword.startsWith("use")) {
    return resolveUseCaseInOwner(ownerComp, id) ?? resolveInOwner(ownerComp, id)
  }
  return resolveInOwner(ownerComp, id)
}

export function findComponentByInterfaceId(
  root: ComponentNode,
  ifaceId: string,
): string | undefined {
  if (root.interfaces?.some((i) => i.id === ifaceId)) return root.uuid
  for (const sub of root.subComponents) {
    const found = findComponentByInterfaceId(sub, ifaceId)
    if (found) return found
  }
  return undefined
}

/**
 * Resolves a `UseCase:<path>` reference to a use case UUID.
 *
 * @param path - Segments from the UseCase reference (last = use case ID,
 *               preceding = path to the owning component).
 * @param root - Root component of the system tree.
 * @param ownerComp - Component that owns the sequence diagram (local scope).
 * @param ownerCompUuid - UUID of ownerComp (used for relative path resolution).
 * @returns The use case UUID, or undefined if it cannot be resolved.
 */
export function resolveUseCaseByPath(
  path: string[],
  root: ComponentNode,
  ownerComp: ComponentNode,
  ownerCompUuid: string,
): string | undefined {
  const ucId = path[path.length - 1]
  const compPath = path.slice(0, -1)

  if (compPath.length === 0) {
    // Local reference — search within ownerComp
    return resolveUseCaseInOwner(ownerComp, ucId)
  }

  // Path reference — resolve the component, then search its use cases
  const compUuid = findNodeByPath(root, compPath.join("/"), ownerCompUuid)
  if (!compUuid) return undefined
  const comp = findCompByUuid(root, compUuid)
  if (!comp) return undefined
  return resolveUseCaseInOwner(comp, ucId)
}
