import type { ComponentNode, ActorNode } from "../store/types"
import { findNodeByPath, isInScope } from "./nodeUtils"
import { findCompByUuid, upsertNodeInTree } from "../nodes/nodeTree"

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

export function findInterfaceUuidByInterfaceId(
  root: ComponentNode,
  ifaceId: string,
): string | undefined {
  const match = root.interfaces?.find((i) => i.id === ifaceId)
  if (match) return match.uuid
  for (const sub of root.subComponents) {
    const found = findInterfaceUuidByInterfaceId(sub, ifaceId)
    if (found) return found
  }
  return undefined
}

export function findInterfaceNameByInterfaceId(
  root: ComponentNode,
  ifaceId: string,
): string | undefined {
  const match = root.interfaces?.find((i) => i.id === ifaceId)
  if (match) return match.name
  for (const sub of root.subComponents) {
    const found = findInterfaceNameByInterfaceId(sub, ifaceId)
    if (found) return found
  }
  return undefined
}

/**
 * Auto-creates a missing node at the given path segments within the tree,
 * provided the parent location exists and is in scope for the diagram owner.
 *
 * - Intermediate missing segments are created as ComponentNodes.
 * - The terminal segment is created as the given entityType (actor or component).
 * - Returns null if the parent cannot be created/found or is out of scope.
 */
export function autoCreateByPath(
  root: ComponentNode,
  segments: string[],
  entityType: "actor" | "component",
  ownerUuid: string,
): { updatedRoot: ComponentNode; uuid: string } | null {
  if (segments.length === 0) return null

  const parentSegments = segments.slice(0, -1)
  const terminalId = segments[segments.length - 1]

  // Resolve (or recursively auto-create) the parent component
  let updatedRoot = root
  let parentUuid: string | null = null

  if (parentSegments.length === 0) {
    // Terminal is a direct child of owner
    parentUuid = ownerUuid
  } else {
    const parentPath = parentSegments.join("/")
    parentUuid = findNodeByPath(updatedRoot, parentPath, ownerUuid)
    if (!parentUuid) {
      // Recursively create the parent (always as a component)
      const parentResult = autoCreateByPath(updatedRoot, parentSegments, "component", ownerUuid)
      if (!parentResult) return null
      updatedRoot = parentResult.updatedRoot
      parentUuid = parentResult.uuid
    }
  }

  // Scope check: parent must be in scope for the diagram owner
  if (!isInScope(updatedRoot, ownerUuid, parentUuid)) return null

  // Create the terminal node inside the parent component
  const newUuid = crypto.randomUUID()
  if (entityType === "actor") {
    const newActor: ActorNode = {
      uuid: newUuid, id: terminalId, name: terminalId, type: "actor", description: "",
    }
    updatedRoot = upsertNodeInTree(updatedRoot, parentUuid, (node) => {
      const comp = node as ComponentNode
      return { ...comp, actors: [...(comp.actors ?? []), newActor] }
    })
  } else {
    const newComp: ComponentNode = {
      uuid: newUuid, id: terminalId, name: terminalId, type: "component",
      description: "", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [],
    }
    updatedRoot = upsertNodeInTree(updatedRoot, parentUuid, (node) => {
      const comp = node as ComponentNode
      return { ...comp, subComponents: [...(comp.subComponents ?? []), newComp] }
    })
  }

  return { updatedRoot, uuid: newUuid }
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
