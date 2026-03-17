import type { ComponentNode, ActorNode, Parameter } from "../store/types"
import { findNodeByPath, isInScope } from "./nodeUtils"
import { findCompByUuid, upsertNodeInTree } from "../nodes/nodeTree"
import { deriveNameFromId } from "./nameUtils"
import { resolveEffectiveInterfaceFunctions } from "./interfaceFunctions"

export function findOwnerActorOrComponentUuidById(
  ownerComp: ComponentNode,
  id: string,
): string | undefined {
  if (ownerComp.id === id) return ownerComp.uuid
  return (
    ownerComp.actors?.find((actor) => actor.id === id)?.uuid ??
    ownerComp.subComponents?.find((component) => component.id === id)?.uuid ??
    undefined
  )
}

export function findOwnerUseCaseUuidById(
  ownerComp: ComponentNode,
  id: string,
): string | undefined {
  for (const diagram of ownerComp.useCaseDiagrams) {
    const useCase = diagram.useCases?.find((candidate) => candidate.id === id)
    if (useCase) return useCase.uuid
  }
  return undefined
}

export function resolveDiagramDeclarationUuid(
  keyword: string,
  id: string,
  fromPath: string | undefined,
  root: ComponentNode,
  ownerComp: ComponentNode | null,
): string | undefined {
  if (fromPath) return findNodeByPath(root, fromPath) ?? undefined
  if (!ownerComp) return undefined
  if (keyword.startsWith("use")) {
    return findOwnerUseCaseUuidById(ownerComp, id) ?? findOwnerActorOrComponentUuidById(ownerComp, id)
  }
  return findOwnerActorOrComponentUuidById(ownerComp, id)
}

export function findComponentUuidByInterfaceId(
  root: ComponentNode,
  ifaceId: string,
): string | undefined {
  if (root.interfaces?.some((iface) => iface.id === ifaceId)) return root.uuid
  for (const sub of root.subComponents) {
    const found = findComponentUuidByInterfaceId(sub, ifaceId)
    if (found) return found
  }
  return undefined
}

/**
 * Finds the component with the given node `id`, searching the subtree rooted at `root`.
 */
function findComponentByIdInSubtree(
  root: ComponentNode,
  nodeId: string,
): ComponentNode | undefined {
  if (root.id === nodeId) return root
  for (const sub of root.subComponents) {
    const found = findComponentByIdInSubtree(sub, nodeId)
    if (found) return found
  }
  return undefined
}

function findPreferredSubtreeMatch<T>(
  root: ComponentNode,
  preferredComponentId: string,
  findInTree: (searchRoot: ComponentNode) => T | undefined,
): T | undefined {
  const preferredComponent = findComponentByIdInSubtree(root, preferredComponentId)
  if (preferredComponent) {
    const preferredMatch = findInTree(preferredComponent)
    if (preferredMatch !== undefined) return preferredMatch
  }
  return findInTree(root)
}

/**
 * Finds the UUID of the component that owns an interface with `ifaceId`,
 * preferring a match within the subtree rooted at the component identified by `receiverNodeId`.
 * Falls back to a global search if the receiver doesn't own the interface.
 */
export function findPreferredInterfaceOwnerUuid(
  root: ComponentNode,
  ifaceId: string,
  receiverNodeId: string,
): string | undefined {
  return findPreferredSubtreeMatch(root, receiverNodeId, (searchRoot) =>
    findComponentUuidByInterfaceId(searchRoot, ifaceId),
  )
}

export function findInterfaceUuidById(
  root: ComponentNode,
  ifaceId: string,
): string | undefined {
  const match = root.interfaces?.find((iface) => iface.id === ifaceId)
  if (match) return match.uuid
  for (const sub of root.subComponents) {
    const found = findInterfaceUuidById(sub, ifaceId)
    if (found) return found
  }
  return undefined
}

/**
 * Finds the UUID of the interface with `ifaceId`, preferring the interface on
 * the component identified by `receiverNodeId` (or its subtree). Falls back to global search.
 */
export function findPreferredInterfaceUuid(
  root: ComponentNode,
  ifaceId: string,
  receiverNodeId: string,
): string | undefined {
  return findPreferredSubtreeMatch(root, receiverNodeId, (searchRoot) =>
    findInterfaceUuidById(searchRoot, ifaceId),
  )
}

export type ResolvedFunctionRefTarget = {
  componentUuid: string
  interfaceUuid: string
  functionUuid: string
  parameters: ReadonlyArray<Parameter>
}

function findFunctionReferenceTargetInTree(
  current: ComponentNode,
  treeRoot: ComponentNode,
  interfaceId: string,
  functionId: string,
): ResolvedFunctionRefTarget | null {
  const iface = current.interfaces?.find((candidate) => candidate.id === interfaceId)
  const fn = iface
    ? resolveEffectiveInterfaceFunctions(iface, current, treeRoot)
      .find((candidate) => candidate.id === functionId)
    : undefined
  if (iface && fn) {
    return {
      componentUuid: current.uuid,
      interfaceUuid: iface.uuid,
      functionUuid: fn.uuid,
      parameters: fn.parameters,
    }
  }
  for (const sub of current.subComponents) {
    const found = findFunctionReferenceTargetInTree(sub, treeRoot, interfaceId, functionId)
    if (found) return found
  }
  return null
}

export function resolveFunctionReferenceTarget(
  root: ComponentNode,
  receiverNodeId: string,
  interfaceId: string,
  functionId: string,
): ResolvedFunctionRefTarget | null {
  return findPreferredSubtreeMatch(root, receiverNodeId, (searchRoot) =>
    findFunctionReferenceTargetInTree(searchRoot, root, interfaceId, functionId) ?? undefined,
  ) ?? null
}

export function findInterfaceNameById(
  root: ComponentNode,
  ifaceId: string,
): string | undefined {
  const match = root.interfaces?.find((iface) => iface.id === ifaceId)
  if (match) return match.name
  for (const sub of root.subComponents) {
    const found = findInterfaceNameById(sub, ifaceId)
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
export function ensureScopedNodePath(
  root: ComponentNode,
  segments: string[],
  entityType: "actor" | "component",
  ownerUuid: string,
): { updatedRoot: ComponentNode; uuid: string } | null {
  if (segments.length === 0) return null

  const parentSegments = segments.slice(0, -1)
  const terminalId = segments[segments.length - 1]

  let updatedRoot = root
  let parentUuid: string | null = null

  if (parentSegments.length === 0) {
    parentUuid = ownerUuid
  } else {
    const parentPath = parentSegments.join("/")
    parentUuid = findNodeByPath(updatedRoot, parentPath, ownerUuid)
    if (!parentUuid) {
      const parentResult = ensureScopedNodePath(updatedRoot, parentSegments, "component", ownerUuid)
      if (!parentResult) return null
      updatedRoot = parentResult.updatedRoot
      parentUuid = parentResult.uuid
    }
  }

  if (!isInScope(updatedRoot, ownerUuid, parentUuid)) return null

  const newUuid = crypto.randomUUID()
  if (entityType === "actor") {
    const newActor: ActorNode = {
      uuid: newUuid, id: terminalId, name: deriveNameFromId(terminalId), type: "actor", description: "",
    }
    updatedRoot = upsertNodeInTree(updatedRoot, parentUuid, (node) => {
      const comp = node as ComponentNode
      return { ...comp, actors: [...(comp.actors ?? []), newActor] }
    })
  } else {
    const newComp: ComponentNode = {
      uuid: newUuid, id: terminalId, name: deriveNameFromId(terminalId), type: "component",
      description: "", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [],
    }
    updatedRoot = upsertNodeInTree(updatedRoot, parentUuid, (node) => {
      const comp = node as ComponentNode
      return { ...comp, subComponents: [...(comp.subComponents ?? []), newComp] }
    })
  }

  return { updatedRoot, uuid: newUuid }
}

type ScopedReferenceComponentResolution =
  | { kind: "resolved"; component: ComponentNode }
  | { kind: "not-found" }
  | { kind: "out-of-scope"; path: string }

export function isReferenceTargetComponentInScope(
  root: ComponentNode,
  ownerCompUuid: string,
  candidateCompUuid: string,
): boolean {
  if (ownerCompUuid === root.uuid) {
    return candidateCompUuid === root.uuid || root.subComponents.some((component) => component.uuid === candidateCompUuid)
  }
  return isInScope(root, ownerCompUuid, candidateCompUuid)
}

function resolveScopedReferenceComponentByPath(
  compPath: string[],
  root: ComponentNode,
  ownerCompUuid: string,
): ScopedReferenceComponentResolution {
  const pathStr = compPath.join("/")
  const compUuid = findNodeByPath(root, pathStr, ownerCompUuid)
  if (!compUuid) return { kind: "not-found" }
  const comp = findCompByUuid(root, compUuid)
  if (!comp) return { kind: "not-found" }
  if (!isReferenceTargetComponentInScope(root, ownerCompUuid, comp.uuid)) {
    return { kind: "out-of-scope", path: pathStr }
  }
  return { kind: "resolved", component: comp }
}

export function assertReferencePathInScope(
  path: string[],
  root: ComponentNode,
  ownerCompUuid: string,
): void {
  const compPath = path.slice(0, -1)
  if (compPath.length === 0) return
  const resolution = resolveScopedReferenceComponentByPath(compPath, root, ownerCompUuid)
  if (resolution.kind === "out-of-scope") {
    throw new Error(`Reference "${path.join("/")}" is out of scope for this diagram`)
  }
}

function resolveOwnerScopedReferenceUuid(
  path: string[],
  root: ComponentNode,
  ownerComp: ComponentNode,
  ownerCompUuid: string,
  findInOwner: (component: ComponentNode, id: string) => string | undefined,
): string | undefined {
  const targetId = path[path.length - 1]
  const compPath = path.slice(0, -1)

  if (compPath.length === 0) {
    return findInOwner(ownerComp, targetId)
  }

  const resolution = resolveScopedReferenceComponentByPath(compPath, root, ownerCompUuid)
  if (resolution.kind !== "resolved") return undefined
  return findInOwner(resolution.component, targetId)
}

/**
 * Resolves a `UseCase:<path>` reference to a use case UUID.
 */
export function resolveUseCaseReferenceUuid(
  path: string[],
  root: ComponentNode,
  ownerComp: ComponentNode,
  ownerCompUuid: string,
): string | undefined {
  return resolveOwnerScopedReferenceUuid(path, root, ownerComp, ownerCompUuid, findOwnerUseCaseUuidById)
}

function findOwnerSequenceDiagramUuidById(
  ownerComp: ComponentNode,
  seqId: string,
): string | undefined {
  for (const ucDiag of ownerComp.useCaseDiagrams) {
    for (const uc of ucDiag.useCases) {
      const seq = uc.sequenceDiagrams?.find((candidate) => candidate.id === seqId)
      if (seq) return seq.uuid
    }
  }
  return undefined
}

/**
 * Resolves a `Sequence:<path>` reference to a sequence diagram UUID.
 */
export function resolveSequenceReferenceUuid(
  path: string[],
  root: ComponentNode,
  ownerComp: ComponentNode,
  ownerCompUuid: string,
): string | undefined {
  return resolveOwnerScopedReferenceUuid(path, root, ownerComp, ownerCompUuid, findOwnerSequenceDiagramUuidById)
}
