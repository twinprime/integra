import type { ComponentNode, ActorNode, UseCaseDiagramNode, Node } from "../store/types"
import { applyIdRenameInActor } from "./actorNode"
import {
  applyIdRenameInUcDiag,
  deleteFromUcDiag,
} from "./useCaseDiagramNode"
import { applyIdRenameInInterface } from "./interfaceNode"
import { updateDescriptionRefs } from "../utils/renameNodeId"

export const deleteFromComponent = (
  comp: ComponentNode,
  uuid: string,
): ComponentNode => ({
  ...comp,
  subComponents: comp.subComponents
    .filter((c) => c.uuid !== uuid)
    .map((c) => deleteFromComponent(c, uuid)),
  actors: comp.actors.filter((a) => a.uuid !== uuid),
  useCaseDiagrams: comp.useCaseDiagrams
    .filter((d) => d.uuid !== uuid)
    .map((d) => deleteFromUcDiag(d, uuid)),
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
