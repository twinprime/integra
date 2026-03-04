import type {
  ComponentNode,
  ActorNode,
  UseCaseDiagramNode,
  InterfaceSpecification,
  Node,
  Parameter,
} from "../store/types"
import { applyIdRenameInActor } from "./actorNode"
import {
  applyIdRenameInUcDiag,
  collectDiagramsFromUcDiag,
  findParentInUcDiag,
  type DiagramRef,
} from "./useCaseDiagramNode"
import { applyIdRenameInInterface, findIdInInterface } from "./interfaceNode"
import { updateDescriptionRefs } from "../utils/renameNodeId"

export const getComponentChildren = (comp: ComponentNode): Node[] => [
  ...comp.subComponents,
  ...comp.actors,
  ...comp.useCaseDiagrams,
]

export const getChildById = (comp: ComponentNode, id: string): Node | null => {
  for (const child of getComponentChildren(comp)) {
    if (child.id === id) return child
  }
  return null
}

export const findCompByUuid = (root: ComponentNode, uuid: string): ComponentNode | null => {
  if (root.uuid === uuid) return root
  for (const sub of root.subComponents) {
    const found = findCompByUuid(sub, uuid)
    if (found) return found
  }
  return null
}

export const findParentInComponent = (comp: ComponentNode, targetUuid: string): Node | null => {
  if (getComponentChildren(comp).some((c) => c.uuid === targetUuid)) return comp
  for (const sub of comp.subComponents) {
    const found = findParentInComponent(sub, targetUuid)
    if (found) return found
  }
  for (const diagram of comp.useCaseDiagrams) {
    const found = findParentInUcDiag(diagram, targetUuid)
    if (found) return found
  }
  return null
}

export const deleteFromComponent = (
  comp: ComponentNode,
  uuid: string,
): ComponentNode => ({
  ...comp,
  subComponents: comp.subComponents
    .filter((c) => c.uuid !== uuid)
    .map((c) => deleteFromComponent(c, uuid)),
  actors: comp.actors.filter((a) => a.uuid !== uuid),
  useCaseDiagrams: comp.useCaseDiagrams.filter((d) => d.uuid !== uuid),
})

export const upsertInComponent = (
  comp: ComponentNode,
  uuid: string,
  updater: (node: Node) => Node,
): ComponentNode => ({
  ...comp,
  subComponents: comp.subComponents.map((c) =>
    c.uuid === uuid
      ? (updater(c) as ComponentNode)
      : upsertInComponent(c, uuid, updater),
  ),
  actors: comp.actors.map((a) =>
    a.uuid === uuid ? (updater(a) as ActorNode) : a,
  ),
  useCaseDiagrams: comp.useCaseDiagrams.map((d) =>
    d.uuid === uuid ? (updater(d) as UseCaseDiagramNode) : d,
  ),
})

export const collectDiagramsFromComponent = (comp: ComponentNode): DiagramRef[] => {
  const refs: DiagramRef[] = []
  for (const ucd of comp.useCaseDiagrams)
    refs.push(...collectDiagramsFromUcDiag(ucd, comp.uuid))
  for (const sub of comp.subComponents)
    refs.push(...collectDiagramsFromComponent(sub))
  return refs
}

export const applyIdRenameInComponent = (
  comp: ComponentNode,
  targetUuid: string,
  oldId: string,
  newId: string,
): ComponentNode => ({
  ...comp,
  id: comp.uuid === targetUuid ? newId : comp.id,
  description: comp.description
    ? updateDescriptionRefs(comp.description, oldId, newId)
    : comp.description,
  subComponents: comp.subComponents.map((c) =>
    applyIdRenameInComponent(c, targetUuid, oldId, newId),
  ),
  actors: comp.actors.map((a) => applyIdRenameInActor(a, targetUuid, oldId, newId)),
  useCaseDiagrams: comp.useCaseDiagrams.map((ucd) =>
    applyIdRenameInUcDiag(ucd, targetUuid, oldId, newId),
  ),
  interfaces: comp.interfaces.map((iface) =>
    applyIdRenameInInterface(iface, targetUuid, oldId, newId),
  ),
})

export const findIdInComponent = (comp: ComponentNode, uuid: string): string | null => {
  if (comp.uuid === uuid) return comp.id
  for (const a of comp.actors) if (a.uuid === uuid) return a.id
  for (const iface of comp.interfaces) {
    const found = findIdInInterface(iface, uuid)
    if (found !== null) return found
  }
  for (const ucd of comp.useCaseDiagrams) {
    if (ucd.uuid === uuid) return ucd.id
    for (const uc of ucd.useCases) {
      if (uc.uuid === uuid) return uc.id
      for (const sd of uc.sequenceDiagrams) {
        if (sd.uuid === uuid) return sd.id
      }
    }
  }
  for (const sub of comp.subComponents) {
    const found = findIdInComponent(sub, uuid)
    if (found !== null) return found
  }
  return null
}

export const getSiblingIdsInComponent = (
  comp: ComponentNode,
  uuid: string,
): string[] | null => {
  const checkArr = (arr: { uuid: string; id: string }[]): string[] | null => {
    if (!arr.some((n) => n.uuid === uuid)) return null
    return arr.filter((n) => n.uuid !== uuid).map((n) => n.id)
  }
  let result = checkArr(comp.subComponents)
  if (result) return result
  result = checkArr(comp.actors)
  if (result) return result
  result = checkArr(comp.useCaseDiagrams)
  if (result) return result
  for (const ucd of comp.useCaseDiagrams) {
    result = checkArr(ucd.useCases)
    if (result) return result
    for (const uc of ucd.useCases) {
      result = checkArr(uc.sequenceDiagrams)
      if (result) return result
    }
  }
  for (const sub of comp.subComponents) {
    result = getSiblingIdsInComponent(sub, uuid)
    if (result) return result
  }
  return null
}

export const updateFunctionParams = (
  comp: ComponentNode,
  functionUuid: string,
  newParams: Parameter[],
): ComponentNode => ({
  ...comp,
  interfaces: comp.interfaces.map((iface) => ({
    ...iface,
    functions: iface.functions.map((f) =>
      f.uuid === functionUuid ? { ...f, parameters: newParams } : f,
    ),
  })),
  subComponents: comp.subComponents.map((sub) =>
    updateFunctionParams(sub, functionUuid, newParams),
  ),
})

export const addFunctionToInterface = (
  comp: ComponentNode,
  existingFunctionUuid: string,
  functionId: string,
  newParams: Parameter[],
): ComponentNode => {
  const ifaceIdx =
    comp.interfaces?.findIndex((i) =>
      i.functions.some((f) => f.uuid === existingFunctionUuid),
    ) ?? -1
  if (ifaceIdx >= 0) {
    return {
      ...comp,
      interfaces: comp.interfaces.map((iface, idx) =>
        idx === ifaceIdx
          ? {
              ...iface,
              functions: [
                ...iface.functions,
                { uuid: crypto.randomUUID(), id: functionId, parameters: newParams },
              ],
            }
          : iface,
      ),
    }
  }
  return {
    ...comp,
    subComponents: comp.subComponents.map((sub) =>
      addFunctionToInterface(sub, existingFunctionUuid, functionId, newParams),
    ),
  }
}

export const removeFunctionsFromInterfaces = (
  comp: ComponentNode,
  uuidsToRemove: Set<string>,
): ComponentNode => {
  if (uuidsToRemove.size === 0) return comp
  return {
    ...comp,
    interfaces: comp.interfaces.map((iface) => ({
      ...iface,
      functions: iface.functions.filter((f) => !uuidsToRemove.has(f.uuid)),
    })),
    subComponents: comp.subComponents.map((sub) =>
      removeFunctionsFromInterfaces(sub, uuidsToRemove),
    ),
  }
}

export const findOwnerComponentUuidInComp = (
  comp: ComponentNode,
  useCaseUuid: string,
): string | null => {
  for (const ucd of comp.useCaseDiagrams) {
    if (ucd.useCases.some((uc) => uc.uuid === useCaseUuid)) return ucd.ownerComponentUuid
  }
  for (const sub of comp.subComponents) {
    const found = findOwnerComponentUuidInComp(sub, useCaseUuid)
    if (found) return found
  }
  return null
}

export const findContainerComponentByUuid = (
  comp: ComponentNode,
  uuid: string,
): ComponentNode | null => {
  if (comp.uuid === uuid) return comp
  for (const sub of comp.subComponents) {
    const found = findContainerComponentByUuid(sub, uuid)
    if (found) return found
  }
  return null
}

export const removeInterfaceFromComponent = (
  comp: ComponentNode,
  interfaceIndex: number,
): ComponentNode => ({
  ...comp,
  interfaces: comp.interfaces.filter((_, i) => i !== interfaceIndex),
})

// Type alias re-exported for callers
export type { InterfaceSpecification }
